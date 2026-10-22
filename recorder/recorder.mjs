// Records a room as data: every peer's root transform and bone pose, and each voice as its own WAV.
// Works the same on a live altspace.js room client and on the mock in ../mock/.
//
// Output (a plain dev format until MCAP lands; see PLAN.md):
//   session.json        roster, timing, rates
//   poses.jsonl         one line per peer per sample: { t, peer, pos, rot, bones }  (bones = base64 bone-pose bytes)
//   events.jsonl        peer joins/leaves and speaking start/stop
//   voice-<peer>.wav    48 kHz mono 16-bit, aligned to recording start
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { BONE_POSE_CODEC_ID, downmixFloat, floatToS16, resampleLinear, SAMPLE_RATE } from 'altspace.js';

const POSE_HZ = 30;
const SPEAKING_RMS = 0.01;
const RESYNC_SAMPLES = SAMPLE_RATE / 5; // 200 ms behind wall clock counts as a gap
// Long enough to bridge the gaps between syllables and words, so one turn isn't split into many.
const SPEAKING_HOLD_MS = 400;

export function startRecorder({ client, clock, outDir, label = 'recording' }) {
  mkdirSync(outDir, { recursive: true });
  const t0 = clock.now();
  const at = () => Math.round(clock.now() - t0);
  const poses = createWriteStream(join(outDir, 'poses.jsonl'));
  const events = createWriteStream(join(outDir, 'events.jsonl'));
  const roster = new Map(); // peerId -> { displayName, userId, roomSessionId, userState, joinedMs, leftMs }
  const voices = new Map(); // peerId -> { segments: [{ lead, chunks, samples }], speaking, lastLoudMs }
  let poseSamples = 0;

  const event = (type, data) => events.write(`${JSON.stringify({ t: at(), type, ...data })}\n`);

  function addPeer(p) {
    if (p.isLocal || roster.has(p.peerId)) return;
    roster.set(p.peerId, { displayName: p.displayName, userId: p.userId, roomSessionId: p.roomSessionId, userState: p.userState, joinedMs: at() });
    event('peer_joined', { peer: p.peerId, name: p.displayName });
  }

  const offs = [
    client.on('peerJoined', addPeer),
    client.on('peerLeft', (p) => {
      const r = roster.get(p.peerId);
      if (r && r.leftMs === undefined) { r.leftMs = at(); event('peer_left', { peer: p.peerId, name: p.displayName }); }
    }),
  ];
  for (const p of client.getPeers()) addPeer(p);

  const stopPoses = clock.every(1000 / POSE_HZ, () => {
    const t = at();
    for (const [peerId, r] of roster) {
      if (r.leftMs !== undefined || !r.roomSessionId) continue;
      const view = client.transforms.view({ kind: 'participant', roomSessionId: r.roomSessionId, transformKey: 'root' });
      const pose = view?.sample(Number.MAX_SAFE_INTEGER, 0);
      if (!pose) continue;
      const bones = view.extension?.(BONE_POSE_CODEC_ID);
      poses.write(`${JSON.stringify({ t, peer: peerId, pos: pose.position, rot: pose.rotation, bones: bones ? Buffer.from(bones).toString('base64') : undefined })}\n`);
      poseSamples++;
    }
  });

  const stopVoice = client.voice.onRemotePcmFrame((frame) => {
    try {
      let v = voices.get(frame.peerId);
      if (!v) voices.set(frame.peerId, (v = { segments: [], speaking: false, lastLoudMs: -Infinity }));
      let mono = downmixFloat(frame.samples, frame.channels);
      if (frame.sampleRate !== SAMPLE_RATE) mono = resampleLinear(mono, frame.sampleRate, SAMPLE_RATE);
      const pcm = floatToS16(mono);
      // The audio's own sample count is its clock. Frames can arrive late but never early, so a run of
      // audio started at the earliest time consistent with every frame's arrival: its "lead". A frame
      // arriving well after that predicts is a real gap (a dropout or unmute) and starts a new run.
      const arrivedAt = ((clock.now() - t0) / 1000) * SAMPLE_RATE;
      let seg = v.segments.at(-1);
      if (!seg || arrivedAt - (seg.samples + pcm.length) - seg.lead > RESYNC_SAMPLES) {
        v.segments.push((seg = { lead: Infinity, chunks: [], samples: 0 }));
      }
      seg.lead = Math.min(seg.lead, arrivedAt - (seg.samples + pcm.length));
      seg.chunks.push(pcm);
      seg.samples += pcm.length;
      const t = Math.round(((seg.lead + seg.samples) / SAMPLE_RATE) * 1000);
      // Simple speaking detection from the frame's loudness.
      let sum = 0;
      for (const s of mono) sum += s * s;
      const rms = Math.sqrt(sum / mono.length);
      if (rms > SPEAKING_RMS) {
        v.lastLoudMs = t;
        if (!v.speaking) { v.speaking = true; event('speaking_started', { peer: frame.peerId, startedMs: t - 10 }); }
      } else if (v.speaking && t - v.lastLoudMs > SPEAKING_HOLD_MS) {
        v.speaking = false;
        event('speaking_stopped', { peer: frame.peerId, endedMs: v.lastLoudMs });
      }
    } catch (error) {
      console.warn(`recorder voice: ${error.message}`);
    }
  });

  async function stop() {
    stopPoses();
    stopVoice();
    for (const off of offs) off();
    const durationMs = at();
    for (const [peerId, v] of voices) {
      if (v.speaking) event('speaking_stopped', { peer: peerId, endedMs: v.lastLoudMs });
      writeWav(join(outDir, `voice-${peerId}.wav`), stem(v.segments));
    }
    await Promise.all([poses, events].map((s) => new Promise((resolve) => s.end(resolve))));
    const session = {
      format: 'altspace-spatial-recording-dev', version: 0, label, recordedAt: new Date().toISOString(),
      // Where time 0 of this recording falls on the room clock it was recorded against.
      startClockMs: t0,
      clock: clock.kind ?? 'wall', // 'virtual' means a deterministic mock run, so timing can be checked exactly
      durationMs, poseHz: POSE_HZ, voiceSampleRate: SAMPLE_RATE, poseSamples,
      peers: Object.fromEntries([...roster].map(([id, r]) => [id, { ...r, voiceFile: voices.has(id) ? `voice-${id}.wav` : null }])),
    };
    writeFileSync(join(outDir, 'session.json'), JSON.stringify(session, null, 2));
    return session;
  }

  return { stop };
}

// Lay each run of audio at its lead, with silence between runs, from recording start.
function stem(segments) {
  const parts = [];
  let cursor = 0;
  for (const seg of segments) {
    let audio = Int16Array.from(seg.chunks.flatMap((c) => Array.from(c)));
    let start = Math.round(seg.lead);
    if (start < cursor) { audio = audio.subarray(cursor - start); start = cursor; }
    if (start > cursor) parts.push(new Int16Array(start - cursor));
    parts.push(audio);
    cursor = start + audio.length;
  }
  return parts;
}

function writeWav(path, chunks) {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples * 2, 40);
  writeFileSync(path, Buffer.concat([header, ...chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))]));
}

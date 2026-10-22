// Records a session as data: every participant's root transform and body pose, and each voice as its own WAV.
// Platform-agnostic: it reads from a source (see ./source.mjs), which a platform plugin such as Altspace provides.
//
// Output (a plain dev format until MCAP lands; see PLAN.md):
//   session.json        source, roster, timing, rates
//   poses.jsonl         one line per participant per sample: { t, peer, pos, rot, bones }  (bones = base64, source's codec)
//   events.jsonl        joins/leaves and speaking start/stop
//   voice-<peer>.wav    48 kHz mono 16-bit, aligned to recording start
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_RATE, downmix, floatToS16, resampleLinear, wavBytes } from './audio.mjs';
import { assertSource } from './source.mjs';

const POSE_HZ = 30;
const SPEAKING_RMS = 0.01;
const RESYNC_SAMPLES = SAMPLE_RATE / 5; // 200 ms behind wall clock counts as a gap
// Long enough to bridge the gaps between syllables and words, so one turn isn't split into many.
const SPEAKING_HOLD_MS = 400;

export function startRecorder({ source, clock, outDir, label = 'recording' }) {
  assertSource(source);
  mkdirSync(outDir, { recursive: true });
  const t0 = clock.now();
  const at = () => Math.round(clock.now() - t0);
  const poses = createWriteStream(join(outDir, 'poses.jsonl'));
  const events = createWriteStream(join(outDir, 'events.jsonl'));
  const roster = new Map(); // peer id -> { displayName, userId, profile, joinedMs, leftMs }
  const voices = new Map(); // peer id -> { segments: [{ lead, chunks, samples }], speaking, lastLoudMs }
  let poseSamples = 0;

  const event = (type, data) => events.write(`${JSON.stringify({ t: at(), type, ...data })}\n`);

  function addPeer(p) {
    if (p.isLocal || roster.has(p.id)) return;
    roster.set(p.id, { displayName: p.displayName, userId: p.userId, profile: p.profile, joinedMs: at() });
    event('peer_joined', { peer: p.id, name: p.displayName });
  }

  const offs = [
    source.on('peerJoined', addPeer),
    source.on('peerLeft', (p) => {
      const r = roster.get(p.id);
      if (r && r.leftMs === undefined) { r.leftMs = at(); event('peer_left', { peer: p.id, name: p.displayName }); }
    }),
  ];
  for (const p of source.peers()) addPeer(p);

  const stopPoses = clock.every(1000 / POSE_HZ, () => {
    const t = at();
    for (const [id, r] of roster) {
      if (r.leftMs !== undefined) continue;
      const pose = source.samplePose(id);
      if (!pose) continue;
      poses.write(`${JSON.stringify({ t, peer: id, pos: pose.position, rot: pose.rotation, bones: pose.bones ? Buffer.from(pose.bones).toString('base64') : undefined })}\n`);
      poseSamples++;
    }
  });

  const stopVoice = source.onVoiceFrame((frame) => {
    try {
      let v = voices.get(frame.peerId);
      if (!v) voices.set(frame.peerId, (v = { segments: [], speaking: false, lastLoudMs: -Infinity }));
      let mono = downmix(frame.samples, frame.channels);
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
    for (const [id, v] of voices) {
      if (v.speaking) event('speaking_stopped', { peer: id, endedMs: v.lastLoudMs });
      writeFileSync(join(outDir, `voice-${id}.wav`), wavBytes(stem(v.segments)));
    }
    await Promise.all([poses, events].map((s) => new Promise((resolve) => s.end(resolve))));
    const session = {
      format: 'xr-time-machine-dev', version: 0, label, recordedAt: new Date().toISOString(),
      source: { platform: source.platform, boneCodec: source.boneCodec ?? null },
      // Where time 0 of this recording falls on the clock it was recorded against.
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

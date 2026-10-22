// Records a session as data: every participant's root transform and body pose, and each voice as its own WAV.
// Platform-agnostic: it reads from a source (see ./source.mjs), which a platform plugin such as Altspace provides.
//
// Output (a plain dev format until MCAP lands; see PLAN.md):
//   session.json        source, roster with join/leave sessions, timing, rates. Written at start, on every
//                       roster change and at stop ("status": "recording" until then), so a crash leaves it usable.
//   poses.jsonl         one line per participant per sample: { t, peer, pos, rot, bones }  (t in ms to 0.1 ms; bones = base64, source's codec)
//   events.jsonl        joins/leaves and speaking start/stop
//   voice-<peer>.wav    48 kHz mono 16-bit, aligned to recording start, streamed to disk as it's recorded
// Streams are appended line by line and flushed by Node as they go; nothing grows in memory with length.
import { mkdirSync, writeFileSync, createWriteStream, renameSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_RATE, downmix, floatToS16, resampleLinear } from './audio.mjs';
import { assertSource } from './source.mjs';
import { VoiceTrack } from './voice-track.mjs';

const POSE_HZ = 30;

export function startRecorder({ source, clock, outDir, label = 'recording' }) {
  assertSource(source);
  mkdirSync(outDir, { recursive: true });
  const t0 = clock.now();
  const at = () => Math.round(clock.now() - t0);
  // Pose times keep 0.1 ms: at walking speed a rounded millisecond is already a millimetre of error.
  const atFine = () => Math.round((clock.now() - t0) * 10) / 10;
  const poses = createWriteStream(join(outDir, 'poses.jsonl'));
  const events = createWriteStream(join(outDir, 'events.jsonl'));
  const roster = new Map(); // peer id -> { displayName, userId, profile, sessions: [{ joinedMs, leftMs? }], present }
  const voices = new Map(); // peer id -> VoiceTrack
  const stats = { poseSamples: 0, voiceFrames: 0, voiceErrors: 0 };
  let stopped = false;

  const event = (type, data, t = at()) => events.write(`${JSON.stringify({ t, type, ...data })}\n`);

  function addPeer(p) {
    if (p.isLocal) return;
    let r = roster.get(p.id);
    if (r?.present) return;
    if (!r) roster.set(p.id, (r = { displayName: p.displayName, userId: p.userId, profile: p.profile, sessions: [], present: false }));
    r.displayName = p.displayName ?? r.displayName; // a reconnect may bring a new name
    r.present = true;
    r.sessions.push({ joinedMs: at() });
    event('peer_joined', { peer: p.id, name: r.displayName, ...(r.sessions.length > 1 ? { rejoin: true } : {}) });
    writeSession('recording');
  }

  function removePeer(p) {
    const r = roster.get(p.id);
    if (!r?.present) return;
    r.present = false;
    r.sessions.at(-1).leftMs = at();
    voices.get(p.id)?.flush(); // commit held-back audio and close any open speech turn
    event('peer_left', { peer: p.id, name: r.displayName });
    writeSession('recording');
  }

  function voiceFor(id) {
    let v = voices.get(id);
    if (!v) {
      v = new VoiceTrack(join(outDir, `voice-${id}.wav`), {
        onSpeaking: (kind, ms) => event(kind === 'started' ? 'speaking_started' : 'speaking_stopped', { peer: id, [kind === 'started' ? 'startedMs' : 'endedMs']: ms }),
      });
      voices.set(id, v);
    }
    return v;
  }

  const offs = [source.on('peerJoined', addPeer), source.on('peerLeft', removePeer)];
  for (const p of source.peers()) addPeer(p);

  const stopPoses = clock.every(1000 / POSE_HZ, () => {
    const t = atFine();
    for (const [id, r] of roster) {
      if (!r.present) continue;
      let pose;
      try { pose = source.samplePose(id); } catch (error) { console.warn(`recorder pose ${id}: ${error.message}`); continue; }
      if (!pose) continue;
      poses.write(`${JSON.stringify({ t, peer: id, pos: pose.position, rot: pose.rotation, bones: pose.bones ? Buffer.from(pose.bones).toString('base64') : undefined })}\n`);
      stats.poseSamples++;
    }
  });

  const stopVoice = source.onVoiceFrame((frame) => {
    if (stopped) return;
    try {
      let mono = downmix(frame.samples, frame.channels);
      if (frame.sampleRate !== SAMPLE_RATE) mono = resampleLinear(mono, frame.sampleRate, SAMPLE_RATE);
      let sum = 0;
      for (const s of mono) sum += s * s;
      voiceFor(frame.peerId).push(floatToS16(mono), Math.sqrt(sum / mono.length), clock.now() - t0);
      stats.voiceFrames++;
    } catch (error) {
      stats.voiceErrors++;
      console.warn(`recorder voice: ${error.message}`);
    }
  });

  function writeSession(status, extra = {}) {
    const session = {
      format: 'xr-time-machine-dev', version: 1, status, label, recordedAt: new Date(Date.now() - at()).toISOString(),
      source: { platform: source.platform, boneCodec: source.boneCodec ?? null },
      // Where time 0 of this recording falls on the clock it was recorded against.
      startClockMs: t0,
      clock: clock.kind ?? 'wall', // 'virtual' means a deterministic mock run, so timing can be checked exactly
      poseHz: POSE_HZ, voiceSampleRate: SAMPLE_RATE, ...stats, ...extra,
      peers: Object.fromEntries([...roster].map(([id, r]) => [id, {
        displayName: r.displayName, userId: r.userId, profile: r.profile, sessions: r.sessions,
        joinedMs: r.sessions[0].joinedMs, ...(r.present ? {} : { leftMs: r.sessions.at(-1).leftMs }),
        voiceFile: voices.has(id) ? `voice-${id}.wav` : null,
      }])),
    };
    // Write then rename, so a crash mid-write never leaves a half-written session.json.
    writeFileSync(join(outDir, 'session.json.tmp'), JSON.stringify(session, null, 2));
    renameSync(join(outDir, 'session.json.tmp'), join(outDir, 'session.json'));
    return session;
  }
  writeSession('recording');

  async function stop() {
    if (stopped) throw new Error('recorder already stopped');
    stopped = true;
    stopPoses();
    stopVoice();
    for (const off of offs) off();
    const durationMs = at();
    const voiceStats = {};
    for (const [id, v] of voices) voiceStats[id] = v.close();
    await Promise.all([poses, events].map((s) => new Promise((resolve) => s.end(resolve))));
    return writeSession('complete', { durationMs, voiceRuns: Object.fromEntries(Object.entries(voiceStats).map(([id, s]) => [id, s.runs])) });
  }

  return { stop };
}

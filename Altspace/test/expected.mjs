// What a perfect recorder would write for the mock scene, worked out from mock/scene.mjs alone.
import { floatToS16 } from '../../core/audio.mjs';
import { CHARACTERS, LINES, SCENE_DURATION_MS, VOICE_SAMPLE_RATE, bonePoseAt, rootAt, voiceFrame, voicedExtent } from '../mock/scene.mjs';

export const POSE_HZ = 30;
// A peer can first appear up to one 60 Hz mock tick after its scripted join.
export const JOIN_GRACE_MS = 17;

// The recorder's sample times: its clock fires every 1000/30 ms, and it rounds to whole milliseconds.
export function sampleTimes(durationMs = SCENE_DURATION_MS) {
  const out = [];
  const period = 1000 / POSE_HZ;
  for (let next = period; next <= durationMs; next += period) out.push(Math.round(next));
  return out;
}

// One expected poses.jsonl line per present character per sample, in join order.
// `required: false` marks samples inside the join grace window, which may or may not appear.
// `startMs` is where the recording's time 0 falls on the scene's clock (session.json startClockMs).
export function expectedPoseLines(startMs = 0, durationMs = SCENE_DURATION_MS - startMs) {
  const order = [...CHARACTERS].sort((a, b) => a.joinMs - b.joinMs);
  const lines = [];
  for (const t of sampleTimes(durationMs)) {
    for (const c of order) {
      if (t + startMs < c.joinMs) continue;
      lines.push({ t, peer: `p-${c.id}`, required: t + startMs >= c.joinMs + JOIN_GRACE_MS });
    }
  }
  return lines;
}

// Ground-truth values at any time, for comparing what was recorded at that time.
export function truthAt(peerId, tMs) {
  const c = CHARACTERS.find((x) => `p-${x.id}` === peerId);
  return { root: rootAt(c, tMs), bones: bonePoseAt(c, tMs) };
}

// The expected events.jsonl entries, ordered by time.
export function expectedEvents() {
  const events = CHARACTERS.map((c) => ({ type: 'peer_joined', peer: `p-${c.id}`, at: c.joinMs }));
  for (const line of LINES) {
    const [start, end] = voicedExtent(line);
    events.push({ type: 'speaking_started', peer: `p-${line.speaker}`, at: start, text: line.text });
    events.push({ type: 'speaking_stopped', peer: `p-${line.speaker}`, at: end, text: line.text });
  }
  return events.sort((a, b) => a.at - b.at);
}

// Each character's voice stem as 16-bit samples on the scene's timeline, exactly as the mock produces it.
export function expectedVoice(peerId, durationMs = SCENE_DURATION_MS) {
  const c = CHARACTERS.find((x) => `p-${x.id}` === peerId);
  const total = Math.round((durationMs / 1000) * VOICE_SAMPLE_RATE);
  return { pcm: floatToS16(voiceFrame(c, 0, total)), joinSample: Math.round((c.joinMs / 1000) * VOICE_SAMPLE_RATE) };
}

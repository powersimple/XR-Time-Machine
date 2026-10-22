// What a perfect recorder would write for a mock scene, worked out from the scene alone (../mock/scenario.mjs).
import { floatToS16 } from '../../core/audio.mjs';
import { VOICE_SAMPLE_RATE } from '../mock/scenario.mjs';

export const POSE_HZ = 30;
// Joins and leaves are noticed on the mock's next 60 Hz tick, so a peer can appear or vanish up to this late.
export const PRESENCE_GRACE_MS = 17;
// The recorder's speech detection: a frame louder than this RMS is speech, and silences shorter than the hold
// are bridged (core/voice-track.mjs).
const SPEAKING_RMS = 0.01;
const SPEAKING_HOLD_MS = 400;

// Every peer id in the order the recorder first meets it (its roster order), with its character and sessions.
export function peers(scene) {
  const out = new Map();
  const sessions = scene.characters.flatMap((c) => c.sessions.map((s) => ({ c, s }))).sort((a, b) => a.s.joinMs - b.s.joinMs);
  for (const { c, s } of sessions) {
    if (s.joinMs >= scene.durationMs) continue;
    if (!out.has(s.peerId)) out.set(s.peerId, { peerId: s.peerId, c, sessions: [] });
    out.get(s.peerId).sessions.push(s);
  }
  return [...out.values()];
}

// The recorder's sample times on its own clock: every 1000/30 ms, rounded to 0.1 ms, bumped by process stalls
// (a timer due during a stall fires once when it ends, then continues from there), as core/clock.mjs does.
export function sampleTimes(scene, durationMs = scene.durationMs) {
  const period = 1000 / POSE_HZ;
  const stalls = [...scene.faults.clockStalls].sort((a, b) => a.atMs - b.atMs);
  const out = [];
  for (let next = period; next <= durationMs;) {
    if (stalls.length && next >= stalls[0].atMs) {
      const end = stalls[0].atMs + stalls.shift().durationMs;
      if (next < end) next = end;
      continue;
    }
    out.push(Math.round(next * 10) / 10);
    next += period;
  }
  return out;
}

// One expected pose line per present peer per sample. `required: false` marks samples within PRESENCE_GRACE_MS of
// a join or leave, which may or may not appear. `startMs` maps recording time to scene time (session.startClockMs).
export function expectedPoseLines(scene, startMs = 0, durationMs = scene.durationMs - startMs) {
  const roster = peers(scene);
  const lines = [];
  for (const t of sampleTimes(scene, durationMs)) {
    const T = t + startMs;
    for (const p of roster) {
      const s = p.sessions.find((x) => T >= x.joinMs && T < x.leaveMs + PRESENCE_GRACE_MS);
      if (!s) continue;
      const settled = T >= s.joinMs + PRESENCE_GRACE_MS && T < s.leaveMs;
      // A reconnect under the same peer id is a gap in its own right: optional right around both edges.
      lines.push({ t, peer: p.peerId, required: settled, bones: scene.hasBonesAt(p.c, T) });
    }
  }
  return lines;
}

// How old a sampled value may legitimately be at scene time T: one publish interval, plus any freeze in progress.
export function stalenessMs(scene, peerId, T, kind) {
  const p = peers(scene).find((x) => x.peerId === peerId);
  let window = kind === 'root' ? 1000 / scene.transformHz(p.c) + 1 : 1000 / 30 + 1;
  for (const f of scene.faults.transformFreezes) {
    if (f.peer === p.c.id && T >= f.fromMs && T < f.toMs + window) window = Math.max(window, T - f.fromMs + window);
  }
  return window;
}

export function truthAt(scene, peerId, T) {
  const p = peers(scene).find((x) => x.peerId === peerId);
  return { root: scene.rootAt(p.c, T), bones: scene.bonePoseAt(p.c, T) };
}

// When each peer is audible: 10 ms frames of the speaker's own voice (as produced, before any network) loud enough
// to count as speech, while present and unmuted; merged the way the recorder's detection merges them (silences
// shorter than SPEAKING_HOLD_MS bridged, a leave always ends a turn). The recorder must reproduce this from what
// actually reached it, placed on its timeline: that's what's being tested.
export function speechTurns(scene, peerId) {
  const p = peers(scene).find((x) => x.peerId === peerId);
  const frame = VOICE_SAMPLE_RATE / 100;
  const turns = [];
  for (let f = 0; f * 10 < scene.durationMs; f++) {
    const ms = f * 10;
    const session = p.sessions.find((s) => ms >= s.joinMs && ms < s.leaveMs);
    if (!session || scene.isMuted(p.c, ms)) continue;
    const samples = scene.voiceSamples(p.c, f * frame, frame);
    let sum = 0;
    for (const s of samples) sum += s * s;
    if (Math.sqrt(sum / frame) <= SPEAKING_RMS) continue;
    const last = turns.at(-1);
    if (last && ms - last.end <= SPEAKING_HOLD_MS && last.session === session) { last.end = ms + 10; continue; }
    const line = scene.lines.find((l) => l.speaker === p.c.id && ms >= l.startMs - 20 && ms < l.endMs);
    turns.push({ start: ms, end: ms + 10, session, text: line?.text ?? '' });
  }
  return turns;
}

export function expectedEvents(scene) {
  const events = [];
  for (const p of peers(scene)) {
    p.sessions.forEach((s, i) => {
      events.push({ type: 'peer_joined', peer: p.peerId, at: s.joinMs, rejoin: i > 0 });
      if (s.leaveMs < scene.durationMs) events.push({ type: 'peer_left', peer: p.peerId, at: s.leaveMs });
    });
    for (const turn of speechTurns(scene, p.peerId)) {
      events.push({ type: 'speaking_started', peer: p.peerId, at: turn.start, text: turn.text });
      events.push({ type: 'speaking_stopped', peer: p.peerId, at: turn.end, text: turn.text });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

// A peer's voice stem on the scene timeline, as 16-bit samples, plus a per-10 ms-frame mask:
// 'voice' (must match exactly), 'silent' (must be silence: absent or muted), or 'edge' (near a join/leave: either).
export function expectedVoice(scene, peerId, durationMs) {
  const p = peers(scene).find((x) => x.peerId === peerId);
  const frame = VOICE_SAMPLE_RATE / 100;
  const frames = Math.ceil(((durationMs / 1000) * VOICE_SAMPLE_RATE) / frame);
  const sceneFrames = Math.ceil(scene.durationMs / 10);
  const pcm = floatToS16(scene.voiceSamples(p.c, 0, frames * frame));
  const mask = new Array(frames);
  for (let f = 0; f < frames; f++) {
    const ms = f * 10;
    const near = p.sessions.some((s) => Math.abs(ms - s.joinMs) <= 30 || Math.abs(ms - s.leaveMs) <= 30);
    const present = p.sessions.some((s) => ms >= s.joinMs && ms < s.leaveMs);
    if (f >= sceneFrames) mask[f] = 'edge'; // past the scene's end: nothing to check
    else if (near) mask[f] = 'edge';
    else if (!present || scene.isMuted(p.c, ms)) mask[f] = 'silent';
    else mask[f] = 'voice';
    if (mask[f] !== 'voice') pcm.fill(0, f * frame, (f + 1) * frame);
  }
  return { pcm, mask, frame };
}

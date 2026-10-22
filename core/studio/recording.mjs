// Loads a recording folder for playback and rendering: poses per participant (interpolated to any time),
// speech turns, presence, and skeletons through the source's bone codec.
//
// A bone codec (provided by the platform plugin that recorded it, e.g. Altspace/codec.mjs) is
//   { name, parents: number[], joints(bytes) => [x, y, z][] | null }   joints in the avatar's local space
//   plus optional { head, neck, hips, leftHand, rightHand } joint indices for cameras to aim at.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { add, lerp, rotate, slerp } from './math.mjs';

export function loadRecording(dir, { codecs = {} } = {}) {
  const session = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
  const codec = codecs[session.source?.boneCodec] ?? null;
  const readJsonl = (f) => readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const events = readJsonl('events.jsonl');

  const peers = new Map();
  for (const [id, p] of Object.entries(session.peers)) {
    peers.set(id, { id, name: p.displayName ?? id, sessions: p.sessions ?? [{ joinedMs: p.joinedMs, leftMs: p.leftMs }], voiceFile: p.voiceFile, samples: [], turns: [], jointCache: new Map() });
  }
  for (const s of readJsonl('poses.jsonl')) peers.get(s.peer)?.samples.push(s);
  for (const p of peers.values()) p.samples.sort((a, b) => a.t - b.t);

  // Speech turns from the events (a turn still open at the end runs to the end).
  const open = new Map();
  for (const e of events) {
    if (e.type === 'speaking_started') open.set(e.peer, e.startedMs ?? e.t);
    if (e.type === 'speaking_stopped' && open.has(e.peer)) { peers.get(e.peer)?.turns.push({ start: open.get(e.peer), end: e.endedMs ?? e.t }); open.delete(e.peer); }
  }
  for (const [id, start] of open) peers.get(id)?.turns.push({ start, end: session.durationMs });

  const durationMs = session.durationMs;

  function jointsOf(peer, sample) {
    if (!codec || !sample?.bones) return null;
    let j = peer.jointCache.get(sample.t);
    if (!j) {
      j = codec.joints(Buffer.from(sample.bones, 'base64'));
      if (peer.jointCache.size > 256) peer.jointCache.clear();
      peer.jointCache.set(sample.t, j);
    }
    return j;
  }

  // The participant's state at time t: root (interpolated), world-space joints, whether present and speaking.
  // Gaps longer than 250 ms between samples are not bridged (they left, or the stream stalled).
  function stateAt(id, t) {
    const peer = peers.get(id);
    const s = peer.samples;
    if (!s.length || t < s[0].t || t > s.at(-1).t + 50) return null;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].t <= t) lo = mid; else hi = mid - 1; }
    const a = s[lo], b = s[lo + 1];
    const k = b && b.t - a.t <= 250 ? (t - a.t) / (b.t - a.t) : 0;
    const position = b && k ? lerp(a.pos, b.pos, k) : a.pos;
    const rotation = b && k ? slerp(a.rot, b.rot, k) : a.rot;
    const ja = jointsOf(peer, a), jb = b && k ? jointsOf(peer, b) : null;
    const local = ja && jb ? ja.map((p, i) => lerp(p, jb[i], k)) : ja;
    const joints = local?.map((p) => add(position, rotate(rotation, p))) ?? null;
    return { id, name: peer.name, position, rotation, joints, speaking: peer.turns.some((x) => t >= x.start && t < x.end) };
  }

  const head = (state) => (state.joints && codec?.head !== undefined ? state.joints[codec.head] : add(state.position, rotate(state.rotation, [0, 1.6, 0])));

  return { dir, session, codec, events, peers, durationMs, stateAt, head, speakersAt: (t) => [...peers.values()].filter((p) => p.turns.some((x) => t >= x.start && t < x.end)).map((p) => p.id) };
}

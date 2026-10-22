// A scripted 10-second scene: three people at a campfire taking turns to talk.
// Everything here is ground truth, so tests can compare a recording against it.
import { BONE_INDEX, loadRig, quatFromEuler, quatFromYaw, quatMultiply, restPose } from 'altspace.js';

export const SCENE_DURATION_MS = 10_000;
export const VOICE_SAMPLE_RATE = 48_000;

// Positions in Unity world space (metres, y up). Everyone stands round the fire at the origin.
export const CHARACTERS = [
  { id: 'ava', displayName: 'Ava', userId: 'sq:1001', pitchHz: 210, position: [-1.2, 0, 1.0], joinMs: 0 },
  { id: 'ben', displayName: 'Ben', userId: 'sq:1002', pitchHz: 115, position: [1.2, 0, 1.0], joinMs: 0 },
  // Cy arrives a second in, then steps towards the fire while talking, to exercise joins and follow cameras.
  { id: 'cy', displayName: 'Cy', userId: 'guest:3003', pitchHz: 160, position: [0, 0, -1.6], joinMs: 1_000, walk: { fromMs: 6_000, toMs: 7_500, to: [0, 0, -0.9] } },
];

// Who talks when. Ava and Ben overlap at the end (laughing), to test simultaneous speakers.
export const LINES = [
  { speaker: 'ava', startMs: 300, endMs: 3_000, text: 'Welcome to the campfire, everyone.' },
  { speaker: 'ben', startMs: 3_300, endMs: 6_000, text: 'Thanks Ava. Cy, you made it!' },
  { speaker: 'cy', startMs: 6_200, endMs: 8_400, text: 'Just in time for the stories.' },
  { speaker: 'ava', startMs: 8_600, endMs: 9_700, text: '(laughs)' },
  { speaker: 'ben', startMs: 8_700, endMs: 9_600, text: '(laughs)' },
];

const rig = loadRig('human');
const rest = restPose(rig);

export function characterById(id) {
  return CHARACTERS.find((c) => c.id === id);
}

export function isPresent(c, tMs) {
  return tMs >= c.joinMs;
}

export function speakerAt(tMs) {
  return LINES.filter((l) => tMs >= l.startMs && tMs < l.endMs).map((l) => l.speaker);
}

export function positionAt(c, tMs) {
  const w = c.walk;
  if (!w || tMs <= w.fromMs) return c.position;
  const k = Math.min(1, (tMs - w.fromMs) / (w.toMs - w.fromMs));
  const e = k * k * (3 - 2 * k);
  return c.position.map((v, i) => v + (w.to[i] - v) * e);
}

function yawTowards(from, to) {
  return (Math.atan2(to[0] - from[0], to[2] - from[2]) * 180) / Math.PI;
}

// Motion is continuous, as real avatars are: nothing snaps when a turn changes, so a sample taken a
// few milliseconds before or after a change still sees nearly the same pose.
const TURN_MS = 500; // time to turn and face a new speaker
const GESTURE_RAMP_MS = 200; // time for talking gestures to fade in and out

// Who a character is looking at: the current other speaker, else whoever spoke last; at first, the fire.
function focusTargetAt(c, tMs) {
  const talking = speakerAt(tMs).filter((s) => s !== c.id);
  const recent = talking[0] ?? [...LINES].reverse().find((l) => l.startMs <= tMs && l.speaker !== c.id)?.speaker;
  return recent ? positionAt(characterById(recent), tMs) : [0, 0, 0];
}

const FOCUS_CHANGES = [...new Set(LINES.flatMap((l) => [l.startMs, l.endMs]))].sort((a, b) => a - b);

// Facing eases from wherever it was when the focus last changed towards the current target.
function yawAt(c, tMs) {
  const target = yawTowards(positionAt(c, tMs), focusTargetAt(c, tMs));
  const change = [...FOCUS_CHANGES].reverse().find((t) => t <= tMs && t > 0);
  if (change === undefined) return target;
  const from = yawAt(c, change - 1);
  const k = Math.min(1, (tMs - change) / TURN_MS);
  const e = k * k * (3 - 2 * k);
  const delta = ((((target - from) % 360) + 540) % 360) - 180;
  return from + delta * e;
}

export function rootAt(c, tMs) {
  return { position: positionAt(c, tMs), rotation: quatFromYaw(yawAt(c, tMs)) };
}

// 0 when silent, 1 mid-line, with smooth ramps at each line's ends.
function talkingWeight(c, tMs) {
  let w = 0;
  for (const l of LINES.filter((x) => x.speaker === c.id)) {
    const k = Math.min((tMs - l.startMs) / GESTURE_RAMP_MS, (l.endMs - tMs) / GESTURE_RAMP_MS);
    if (k > 0) w = Math.max(w, Math.min(1, k * k * (3 - 2 * Math.min(1, k))));
  }
  return w;
}

export function bonePoseAt(c, tMs) {
  const rotations = rest.rotations.map((q) => [...q]);
  const w = talkingWeight(c, tMs);
  const s = tMs / 1000;
  // Head: a slow idle sway, blending into nodding while talking.
  const nod = (1 - w) * 2 * Math.sin(s * 0.9) + w * 6 * Math.sin(s * 2 * Math.PI * 2.2);
  const tilt = 3 * Math.sin(s * 0.7 + c.pitchHz);
  rotations[BONE_INDEX.Head] = quatMultiply(rest.rotations[BONE_INDEX.Head], quatFromEuler(nod, 0, tilt));
  // Talking hands: the right forearm lifts in a gentle beat.
  const lift = w * (25 + 15 * Math.sin(s * 2 * Math.PI * 1.3));
  rotations[BONE_INDEX.RightLowerArm] = quatMultiply(rest.rotations[BONE_INDEX.RightLowerArm], quatFromEuler(0, 0, lift));
  const breathe = 0.004 * Math.sin(s * 2 * Math.PI * 0.25);
  const hip = rest.hipWorldPos;
  return { hipWorldPos: [hip[0], hip[1] + breathe, hip[2]], rotations };
}

const SYLLABLE_PERIOD_MS = 1000 / 2.05; // voiceFrame's syllable envelope: voiced for the first half of each period

// When a line is actually audible: from its start to the end of its last voiced syllable,
// which can fall before the line's scripted end.
export function voicedExtent(line) {
  const d = line.endMs - line.startMs;
  const k = Math.floor(d / SYLLABLE_PERIOD_MS);
  const r = d - k * SYLLABLE_PERIOD_MS;
  return [line.startMs, line.startMs + k * SYLLABLE_PERIOD_MS + Math.min(r, SYLLABLE_PERIOD_MS / 2)];
}

function noise(n, seed) {
  let x = (n * 2654435761 + seed * 40503) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822507) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 3266489909) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// A speech-like voice: a pitched buzz shaped by shifting vowel formants and ~4 syllables a second.
// Each 10 ms frame is computed from absolute sample time, so frames join up without clicks.
export function voiceFrame(c, startSample, length) {
  const out = new Float32Array(length);
  const lines = LINES.filter((l) => l.speaker === c.id);
  for (let i = 0; i < length; i++) {
    const n = startSample + i;
    const tMs = (n / VOICE_SAMPLE_RATE) * 1000;
    const line = lines.find((l) => tMs >= l.startMs && tMs < l.endMs);
    let v = 0;
    if (line) {
      const lt = (tMs - line.startMs) / 1000;
      const fade = Math.min(1, lt / 0.05, (line.endMs - tMs) / 50);
      const syllable = Math.pow(Math.max(0, Math.sin(lt * Math.PI * 4.1)), 0.6);
      const f0 = c.pitchHz * (1 + 0.06 * Math.sin(lt * 3.3));
      const vowel = (Math.sin(lt * 7.7) + 1) / 2;
      const t = n / VOICE_SAMPLE_RATE;
      for (let h = 1; h <= 12; h++) {
        const f = f0 * h;
        const formant = Math.exp(-(((f - (500 + 300 * vowel)) / 250) ** 2)) + 0.6 * Math.exp(-(((f - (1500 + 700 * vowel)) / 350) ** 2));
        v += (formant + 0.05) * Math.sin(2 * Math.PI * f * t) / h;
      }
      v *= 0.12 * syllable * fade;
    }
    // Low noise floor, as a real open mic has. Seeded by sample and speaker, so tests can regenerate it exactly.
    out[i] = v + (noise(n, c.pitchHz) - 0.5) * 0.0006;
  }
  return out;
}

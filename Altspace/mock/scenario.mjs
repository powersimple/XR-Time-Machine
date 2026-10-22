// Turns a scenario definition (see ./scenarios/) into a scene: the ground truth a mock room plays and tests check.
//
// A scenario:
//   name, durationMs
//   characters: [{ id, displayName, userId, pitchHz, position,
//                  sessions?: [{ joinMs, leaveMs?, peerId? }]   default one session for the whole scene; a later
//                                                               session with the same peerId is a reconnect
//                  walks?: [{ fromMs, toMs, to }]               eased moves, in order
//                  mutes?: [{ fromMs, toMs }]                   no voice frames are sent while muted
//                  bones?: false | { fromMs }                   no bone poses at all, or none until fromMs
//                  transformHz?: number }]                      publish rate (default 60), e.g. lowered by distance LOD
//   lines: [{ speaker, startMs, endMs, text }]
//   faults?: { voiceStalls: [{ fromMs, toMs }]        voice delivery pauses, then bursts everything that queued
//              transformFreezes: [{ peer, fromMs, toMs }]  a peer's transform stops updating
//              clockStalls: [{ atMs, durationMs }] }  the whole process stalls (GC, OS); timers fire late once
import { BONE_INDEX, loadRig, quatFromEuler, quatFromYaw, quatMultiply, restPose } from 'altspace.js';

export const VOICE_SAMPLE_RATE = 48_000;
const TURN_MS = 500; // time to turn and face a new speaker
const GESTURE_RAMP_MS = 200; // time for talking gestures to fade in and out
const SYLLABLE_PERIOD_MS = 1000 / 2.05; // voice envelope: voiced for the first half of each period

const rig = loadRig('human');
const rest = restPose(rig);

const within = (t, spans) => (spans ?? []).some((s) => t >= s.fromMs && t < s.toMs);

export function buildScene(def) {
  const characters = def.characters.map((c) => ({
    ...c,
    sessions: (c.sessions ?? [{ joinMs: 0 }]).map((s, i) => ({ leaveMs: Infinity, peerId: `p-${c.id}${i ? `-${i + 1}` : ''}`, ...s })),
    walks: c.walks ?? [],
    mutes: c.mutes ?? [],
  }));
  const lines = [...def.lines].sort((a, b) => a.startMs - b.startMs);
  const faults = { voiceStalls: [], transformFreezes: [], clockStalls: [], ...def.faults };
  const byId = new Map(characters.map((c) => [c.id, c]));
  const focusChanges = [...new Set(lines.flatMap((l) => [l.startMs, l.endMs]))].sort((a, b) => a - b);

  const sessionAt = (c, t) => c.sessions.find((s) => t >= s.joinMs && t < s.leaveMs);
  const isPresent = (c, t) => !!sessionAt(c, t);
  const speakersAt = (t) => lines.filter((l) => t >= l.startMs && t < l.endMs && isPresent(byId.get(l.speaker), t)).map((l) => l.speaker);

  function positionAt(c, t) {
    let p = c.position;
    for (const w of c.walks) {
      if (t <= w.fromMs) break;
      const k = Math.min(1, (t - w.fromMs) / (w.toMs - w.fromMs));
      const e = k * k * (3 - 2 * k);
      p = p.map((v, i) => v + (w.to[i] - v) * e);
    }
    return p;
  }

  const yawTowards = (from, to) => (Math.atan2(to[0] - from[0], to[2] - from[2]) * 180) / Math.PI;

  // Who a character looks at: another current speaker, else whoever spoke last, else the centre.
  function focusTargetAt(c, t) {
    const talking = speakersAt(t).filter((s) => s !== c.id);
    const recent = talking[0] ?? [...lines].reverse().find((l) => l.startMs <= t && l.speaker !== c.id)?.speaker;
    return recent ? positionAt(byId.get(recent), t) : [0, 0, 0];
  }

  // Facing eases from wherever it was at the last focus change towards the current target; no snapping.
  const yawCache = new Map();
  function yawAt(c, t) {
    const target = yawTowards(positionAt(c, t), focusTargetAt(c, t));
    const change = focusChanges.findLast((x) => x <= t && x > 0);
    if (change === undefined) return target;
    const key = `${c.id}@${change}`;
    let from = yawCache.get(key);
    if (from === undefined) yawCache.set(key, (from = yawAt(c, change - 1)));
    const k = Math.min(1, (t - change) / TURN_MS);
    const delta = ((((target - from) % 360) + 540) % 360) - 180;
    return from + delta * k * k * (3 - 2 * k);
  }

  function talkingWeight(c, t) {
    let w = 0;
    for (const l of lines) {
      if (l.speaker !== c.id) continue;
      const k = Math.min((t - l.startMs) / GESTURE_RAMP_MS, (l.endMs - t) / GESTURE_RAMP_MS);
      if (k > 0) w = Math.max(w, Math.min(1, k * k * (3 - 2 * Math.min(1, k))));
    }
    return w;
  }

  function rootAt(c, t) {
    return { position: positionAt(c, t), rotation: quatFromYaw(yawAt(c, t)) };
  }

  function bonePoseAt(c, t) {
    const rotations = rest.rotations.map((q) => [...q]);
    const w = talkingWeight(c, t);
    const s = t / 1000;
    const nod = (1 - w) * 2 * Math.sin(s * 0.9) + w * 6 * Math.sin(s * 2 * Math.PI * 2.2);
    const tilt = 3 * Math.sin(s * 0.7 + c.pitchHz);
    rotations[BONE_INDEX.Head] = quatMultiply(rest.rotations[BONE_INDEX.Head], quatFromEuler(nod, 0, tilt));
    // The rig's rest pose has arms straight out; let them hang at the sides, with a little sway.
    const sway = 3 * Math.sin(s * 1.1 + c.pitchHz);
    rotations[BONE_INDEX.LeftUpperArm] = quatMultiply(quatFromEuler(70 + sway, 0, 0), rest.rotations[BONE_INDEX.LeftUpperArm]);
    rotations[BONE_INDEX.RightUpperArm] = quatMultiply(quatFromEuler(70 - sway, 0, 0), rest.rotations[BONE_INDEX.RightUpperArm]);
    // Talking: the right forearm comes up and forward in a gentle beat.
    const lift = w * (45 + 20 * Math.sin(s * 2 * Math.PI * 1.3));
    rotations[BONE_INDEX.RightLowerArm] = quatMultiply(quatFromEuler(0, 0, lift), rest.rotations[BONE_INDEX.RightLowerArm]);
    const breathe = 0.004 * Math.sin(s * 2 * Math.PI * 0.25);
    const hip = rest.hipWorldPos;
    return { hipWorldPos: [hip[0], hip[1] + breathe, hip[2]], rotations };
  }

  const hasBonesAt = (c, t) => c.bones !== false && !(c.bones && t < c.bones.fromMs);
  const isMuted = (c, t) => within(t, c.mutes);
  const isFrozen = (c, t) => faults.transformFreezes.some((f) => f.peer === c.id && t >= f.fromMs && t < f.toMs);

  // The voice as produced at the speaker: a pitched buzz shaped by vowel formants and ~4 syllables a second.
  // Each sample is computed from absolute time, so frames join without clicks and tests can regenerate it exactly.
  function voiceSamples(c, startSample, length) {
    const out = new Float32Array(length);
    const mine = lines.filter((l) => l.speaker === c.id);
    for (let i = 0; i < length; i++) {
      const n = startSample + i;
      const tMs = (n / VOICE_SAMPLE_RATE) * 1000;
      const line = mine.find((l) => tMs >= l.startMs && tMs < l.endMs);
      let v = 0;
      if (line) {
        const lt = (tMs - line.startMs) / 1000;
        const fade = Math.min(1, lt / 0.05, (line.endMs - tMs) / 50);
        const syllable = Math.pow(Math.max(0, Math.sin(lt * Math.PI * 4.1)), 0.6);
        const f0 = c.pitchHz * (1 + 0.06 * Math.sin(lt * 3.3));
        const vowel = (Math.sin(lt * 7.7) + 1) / 2;
        const t = n / VOICE_SAMPLE_RATE;
        for (let h = 1; h <= 8; h++) {
          const f = f0 * h;
          const formant = Math.exp(-(((f - (500 + 300 * vowel)) / 250) ** 2)) + 0.6 * Math.exp(-(((f - (1500 + 700 * vowel)) / 350) ** 2));
          v += ((formant + 0.05) * Math.sin(2 * Math.PI * f * t)) / h;
        }
        v *= 0.12 * syllable * fade;
      }
      out[i] = v + (noise(n, c.pitchHz) - 0.5) * 0.0006;
    }
    return out;
  }

  // When a line is audible: from its start to the end of its last voiced syllable.
  function voicedExtent(line) {
    const d = line.endMs - line.startMs;
    const k = Math.floor(d / SYLLABLE_PERIOD_MS);
    const r = d - k * SYLLABLE_PERIOD_MS;
    return [line.startMs, line.startMs + k * SYLLABLE_PERIOD_MS + Math.min(r, SYLLABLE_PERIOD_MS / 2)];
  }

  return {
    name: def.name, description: def.description ?? '', durationMs: def.durationMs, characters, lines, faults,
    byId, sessionAt, isPresent, speakersAt, positionAt, rootAt, bonePoseAt, hasBonesAt, isMuted, isFrozen,
    voiceSamples, voicedExtent,
    transformHz: (c) => c.transformHz ?? 60,
  };
}

function noise(n, seed) {
  let x = (n * 2654435761 + seed * 40503) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822507) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 3266489909) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

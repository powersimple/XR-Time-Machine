// Virtual cameras for a recording. A camera spec is plain data (saved in the studio project):
//   { id, label, type, fov, smoothing, ...params }
//   type 'fixed'   eye, target                               a locked-off shot
//   type 'orbit'   center, radius, height, periodS            circles the group
//   type 'follow'  subject, distance, height, side            a close-up on one person, from the front
//   type 'speaker' distance, height, side                     follows whoever is speaking, blending between people
// smoothing: seconds for a critically damped spring to settle (0 = locked to its subject). Paths are computed
// frame by frame, so moves ease in and out instead of snapping.
import { add, normalize, rotate, scale, sub } from './math.mjs';

// The group's centre and radius over the whole recording, from everyone's root positions. Robust to strays
// (someone parked far away, a recorder avatar at the origin): median centre, 85th-percentile radius.
export function bounds(rec) {
  const pts = [...rec.peers.values()].flatMap((p) => p.samples.filter((_, i) => i % 15 === 0).map((s) => s.pos));
  if (!pts.length) return { center: [0, 0, 0], radius: 2 };
  const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const center = [median(pts.map((p) => p[0])), 0, median(pts.map((p) => p[2]))];
  const d = pts.map((p) => Math.hypot(p[0] - center[0], p[2] - center[2])).sort((a, b) => a - b);
  return { center, radius: Math.max(1.5, d[Math.floor(d.length * 0.85)]) };
}

export function defaultCameras(rec, { maxCloseUps = 8 } = {}) {
  const { center, radius } = bounds(rec);
  const eyeHeight = 1.45;
  const cams = [
    { id: 'wide', label: 'Wide', type: 'fixed', fov: 50, eye: [center[0], 2.4 + radius * 0.35, center[2] - (radius * 2.2 + 2)], target: [center[0], 1.0, center[2]], smoothing: 0 },
    { id: 'overhead', label: 'Overhead', type: 'fixed', fov: 55, eye: [center[0], 3 + radius * 2.4, center[2] - radius * 0.9], target: [center[0], 0.6, center[2]], smoothing: 0 },
    { id: 'orbit', label: 'Orbit', type: 'orbit', fov: 45, center: [center[0], 1.1, center[2]], radius: radius * 1.7 + 1.5, height: 2.1, periodS: 60, smoothing: 0 },
    { id: 'speaker', label: 'Speaker', type: 'speaker', fov: 36, distance: 2.4, height: eyeHeight + 0.1, side: 0.4, smoothing: 0.7 },
  ];
  // Close-ups for the people who talk the most.
  const talkers = [...rec.peers.values()]
    .map((p) => ({ p, talk: p.turns.reduce((n, t) => n + t.end - t.start, 0) }))
    .filter((x) => x.p.samples.length)
    .sort((a, b) => b.talk - a.talk)
    .slice(0, maxCloseUps);
  for (const { p } of talkers) cams.push({ id: `close-${p.id}`, label: `${p.name} close`, type: 'follow', subject: p.id, fov: 34, distance: 2.2, height: eyeHeight + 0.05, side: 0.35, smoothing: 0.5 });
  return cams;
}

// Where a camera looks from and at, frame by frame: [{ eye, target, fov }].
export function cameraPath(rec, cam, fps, frames) {
  const out = [];
  let eye = null, target = null, vEye = [0, 0, 0], vTarget = [0, 0, 0];
  let subject = null;
  const dt = 1 / fps;
  for (let f = 0; f < frames; f++) {
    const t = (f / fps) * 1000;
    let want = null;
    if (cam.type === 'fixed') want = { eye: cam.eye, target: cam.target };
    else if (cam.type === 'orbit') {
      const a = (2 * Math.PI * (t / 1000)) / cam.periodS;
      want = { eye: [cam.center[0] + Math.sin(a) * cam.radius, cam.height, cam.center[2] - Math.cos(a) * cam.radius], target: cam.center };
    } else {
      // follow / speaker: frame one person from the front, a little to one side, aimed at their head.
      if (cam.type === 'speaker') subject = rec.speakersAt(t)[0] ?? subject ?? [...rec.peers.keys()][0];
      else subject = cam.subject;
      const state = subject && rec.stateAt(subject, t);
      if (state) {
        const head = rec.head(state);
        const forward = normalize(rotate(state.rotation, [0, 0, 1]));
        const right = normalize(rotate(state.rotation, [1, 0, 0]));
        const eyePos = add(add(state.position, add(scale(forward, cam.distance), scale(right, cam.side))), [0, cam.height, 0]);
        // Aim at the upper chest, so the head sits in the upper third of the frame.
        want = { eye: eyePos, target: add(head, [0, -0.32, 0]) };
      } else if (eye) want = { eye, target };
    }
    if (!want) want = { eye: [0, 2, -5], target: [0, 1, 0] };
    if (!eye || !cam.smoothing) { eye = want.eye; target = want.target; vEye = [0, 0, 0]; vTarget = [0, 0, 0]; }
    else {
      [eye, vEye] = spring(eye, vEye, want.eye, cam.smoothing, dt);
      [target, vTarget] = spring(target, vTarget, want.target, cam.smoothing * 0.7, dt);
    }
    out.push({ eye, target, fov: cam.fov });
  }
  return out;
}

// Critically damped spring towards `goal`, settling in about `settle` seconds.
function spring(x, v, goal, settle, dt) {
  const omega = 4.6 / settle; // ~1% left after `settle` seconds
  const exp = Math.exp(-omega * dt);
  const delta = sub(x, goal);
  const temp = add(v, scale(delta, omega)).map((c) => c * dt);
  const nv = sub(v, scale(temp, omega)).map((c) => c * exp);
  const nx = add(goal, scale(add(delta, temp), exp));
  return [nx, nv];
}

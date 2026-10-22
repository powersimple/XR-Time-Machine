// Small vector and quaternion helpers. World space is Unity's: metres, y up, left-handed; quaternions [x, y, z, w].

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a) => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function rotate(q, v) {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

export function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  d *= s;
  if (d > 0.9995) {
    const q = a.map((v, i) => v + (b[i] * s - v) * t);
    const l = Math.hypot(...q);
    return q.map((v) => v / l);
  }
  const th = Math.acos(d);
  const k0 = Math.sin((1 - t) * th) / Math.sin(th);
  const k1 = (Math.sin(t * th) / Math.sin(th)) * s;
  return a.map((v, i) => v * k0 + b[i] * k1);
}

// Heading of a rotation in degrees: 0 faces +z, 90 faces +x.
export function yawOf(q) {
  const f = rotate(q, [0, 0, 1]);
  return (Math.atan2(f[0], f[2]) * 180) / Math.PI;
}

// A pinhole camera looking from `eye` at `target`. project() returns screen pixels and depth, or null if behind.
export function makeView(eye, target, fovDeg, width, height) {
  const forward = normalize(sub(target, eye));
  let right = cross([0, 1, 0], forward); // left-handed, y up: right = up × forward
  if (length(right) < 1e-6) right = [1, 0, 0];
  right = normalize(right);
  const up = cross(forward, right);
  const f = (height / 2) / Math.tan(((fovDeg * Math.PI) / 180) / 2);
  return {
    eye, forward, right, up, focal: f, width, height,
    project(p) {
      const d = sub(p, eye);
      const z = dot(d, forward);
      if (z < 0.05) return null;
      return [width / 2 + (dot(d, right) * f) / z, height / 2 - (dot(d, up) * f) / z, z];
    },
  };
}

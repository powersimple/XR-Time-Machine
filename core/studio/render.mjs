// Draws one frame of a recording from one camera: a floor grid, then every participant as a stick figure
// (skeleton through the source's bone codec, or a simple capsule when there are no bones), nearest last.
// Speakers get a glowing ring; everyone gets a name tag. Optional overlays: camera label and timecode.
import { Canvas } from './raster.mjs';
import { add, makeView, rotate } from './math.mjs';

const PALETTE = [[255, 166, 77], [92, 200, 255], [140, 230, 120], [255, 120, 160], [200, 160, 255], [255, 220, 90], [90, 230, 210], [255, 140, 110], [170, 200, 255], [230, 230, 230]];

export function colorFor(rec, id) {
  return PALETTE[[...rec.peers.keys()].indexOf(id) % PALETTE.length];
}

export function renderFrame(rec, t, shot, { width, height, label = null, timecode = null }) {
  const c = new Canvas(width, height);
  c.gradient([28, 34, 54], [12, 14, 22]);
  const view = makeView(shot.eye, shot.target, shot.fov, width, height);
  drawFloor(c, view, shot.target);

  const states = [...rec.peers.keys()].map((id) => rec.stateAt(id, t)).filter(Boolean);
  const depth = (s) => { const p = view.project(rec.head(s)); return p ? p[2] : Infinity; };
  const tags = [];
  for (const s of states.sort((a, b) => depth(b) - depth(a))) { const tag = drawPerson(c, view, rec, s, colorFor(rec, s.id), t); if (tag) tags.push(tag); }
  drawTags(c, tags);

  if (label) {
    c.rect(12, 12, c.textWidth(label, 2) + 16, 26, [0, 0, 0], 0.55);
    c.text(label, 20, 18, 2, [255, 255, 255]);
  }
  if (timecode) {
    const w = c.textWidth(timecode, 2);
    c.rect(width - w - 28, 12, w + 16, 26, [0, 0, 0], 0.55);
    c.text(timecode, width - w - 20, 18, 2, [255, 255, 255]);
  }
  return c;
}

function drawFloor(c, view, target) {
  // A 1 m grid between the camera and what it looks at, drawn in 2 m pieces so the far end can fade and nothing
  // crosses the near plane. It fades out past ~1.6× the distance to the target, so far-away groups still stand on it.
  const cx = Math.round((view.eye[0] + target[0]) / 2), cz = Math.round((view.eye[2] + target[2]) / 2);
  const reach = Math.max(16, Math.hypot(target[0] - view.eye[0], target[2] - view.eye[2]) * 1.6);
  const extent = Math.min(40, Math.ceil(reach / 1.5));
  for (let k = -extent; k <= extent; k++) {
    for (let s = -extent; s < extent; s += 2) {
      for (const [a, b] of [[[cx + k, 0, cz + s], [cx + k, 0, cz + s + 2]], [[cx + s, 0, cz + k], [cx + s + 2, 0, cz + k]]]) {
        const pa = view.project(a), pb = view.project(b);
        if (!pa || !pb) continue;
        const fade = Math.max(0, 1 - Math.max(pa[2], pb[2]) / reach);
        if (fade > 0) c.line(pa[0], pa[1], pb[0], pb[1], 1.2, [70, 84, 120], 1.2, 0.6 * fade);
      }
    }
  }
}

function drawPerson(c, view, rec, s, color, t) {
  const px = (worldSize, z) => (worldSize * view.focal) / z;
  const head = rec.head(s);
  const ph = view.project(head);
  if (!ph) return;
  const codec = rec.codec;
  if (s.joints && codec) {
    const proj = s.joints.map((j) => view.project(j));
    const drawn = codec.drawn ?? s.joints.map((_, i) => i);
    for (const i of drawn) {
      const p = codec.parents[i];
      if (p < 0 || i === codec.head) continue;
      const a = proj[p], b = proj[i];
      if (!a || !b) continue;
      c.line(a[0], a[1], b[0], b[1], Math.max(1.5, px(0.075, a[2])), color, Math.max(1.5, px(0.06, b[2])));
    }
  } else {
    // No skeleton: a capsule from the floor to the neck.
    const foot = view.project(s.position);
    const neck = view.project(add(s.position, rotate(s.rotation, [0, 1.35, 0])));
    if (foot && neck) c.line(foot[0], foot[1], neck[0], neck[1], Math.max(2, px(0.32, neck[2])), color, Math.max(2, px(0.26, neck[2])), 0.9);
  }
  const r = Math.max(3, px(0.12, ph[2]));
  if (s.speaking) {
    const pulse = 0.5 + 0.5 * Math.sin((t / 1000) * Math.PI * 4);
    c.ring(ph[0], ph[1], r * (1.5 + 0.15 * pulse), Math.max(2, r * 0.18), [255, 255, 255], 0.55 + 0.35 * pulse);
  }
  c.disc(ph[0], ph[1], r, color);
  // Facing: a small "nose" dot so you can tell where someone is looking.
  const nose = view.project(add(head, rotate(s.rotation, [0, 0, 0.13])));
  if (nose && nose[2] < ph[2]) c.disc(nose[0], nose[1], Math.max(1.5, r * 0.25), [20, 22, 30], 0.8);

  // The name tag is placed later, with the others, so tags don't pile up (see drawTags).
  if (ph[2] > 30) return null;
  return { name: s.name ?? s.id, x: ph[0], y: ph[1] - r * 2.2, z: ph[2], speaking: s.speaking };
}

// Name tags, nearest first: each tag that would overlap one already placed moves up until it's clear (up to
// three tries), else it's dropped. Far-away people get smaller tags.
function drawTags(c, tags) {
  const placed = [];
  for (const t of tags.sort((a, b) => a.z - b.z)) {
    const size = t.z < 3 ? 3 : t.z < 12 ? 2 : 1;
    const w = c.textWidth(t.name, size) + 12, h = 7 * size + 8;
    let x = t.x - w / 2, y = Math.max(6, t.y - h);
    let ok = false;
    for (let tries = 0; tries < 4 && !ok; tries++) {
      ok = !placed.some((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
      if (!ok) y = placed.filter((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y).reduce((m, p) => Math.min(m, p.y), y) - h - 2;
    }
    if (!ok || y < 0) continue;
    placed.push({ x, y, w, h });
    c.rect(x, y, w, h, [0, 0, 0], 0.5);
    c.text(t.name, x + 6, y + 4, size, t.speaking ? [255, 255, 255] : [210, 214, 224]);
  }
}

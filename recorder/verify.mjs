// Checks a recording of the mock scene against the scene's ground truth.
//   npm run verify:mock -- [recordings/<dir>]     (defaults to the newest mock recording)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decodeBonePose, BONE_COUNT } from 'altspace.js';
import { CHARACTERS, LINES, SCENE_DURATION_MS, positionAt } from '../mock/scene.mjs';

const dir = process.argv[2] ?? newest('recordings', 'mock-campfire-');
const session = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
const poses = lines(join(dir, 'poses.jsonl'));
const events = lines(join(dir, 'events.jsonl'));
let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

console.log(`Verifying ${dir}\n`);
check(Math.abs(session.durationMs - SCENE_DURATION_MS) <= 50, 'duration matches the scene', `${session.durationMs} ms`);
check(Object.keys(session.peers).length === CHARACTERS.length, 'every character recorded, recorder bot excluded', Object.values(session.peers).map((p) => p.displayName).join(', '));

for (const c of CHARACTERS) {
  const id = `p-${c.id}`;
  const peer = session.peers[id];
  if (!peer) { check(false, `${c.displayName} present`); continue; }
  check(Math.abs(peer.joinedMs - c.joinMs) <= 40, `${c.displayName} joined on time`, `${peer.joinedMs} ms, expected ${c.joinMs}`);

  const mine = poses.filter((p) => p.peer === id);
  const expected = ((SCENE_DURATION_MS - c.joinMs) / 1000) * session.poseHz;
  check(Math.abs(mine.length - expected) <= 3, `${c.displayName} pose rate ~${session.poseHz} Hz`, `${mine.length} samples, expected ~${Math.round(expected)}`);
  const last = mine.at(-1);
  const want = positionAt(c, last.t);
  const err = Math.hypot(...last.pos.map((v, i) => v - want[i]));
  check(err < 0.05, `${c.displayName} final position`, `[${last.pos.map((v) => v.toFixed(2))}] off by ${err.toFixed(3)} m`);
  const bones = decodeBonePose(Buffer.from(last.bones, 'base64'));
  check(bones?.rotations.length === BONE_COUNT, `${c.displayName} bone poses decode`, `${bones?.rotations.length} bones`);

  const wav = readFileSync(join(dir, peer.voiceFile));
  const seconds = wav.readUInt32LE(40) / 2 / wav.readUInt32LE(24);
  check(Math.abs(seconds * 1000 - SCENE_DURATION_MS) <= 30, `${c.displayName} voice stem aligned to start`, `${seconds.toFixed(2)} s`);

  // Speaking segments from the recorder vs the script's lines (overlapping lines merge).
  const got = segments(events, id);
  const scripted = LINES.filter((l) => l.speaker === c.id).map((l) => [l.startMs, l.endMs]);
  // A line can end in the silent gap after its last syllable (up to ~250 ms), so ends get more slack than starts.
  const ok = got.length === scripted.length && got.every(([s, e], i) => Math.abs(s - scripted[i][0]) <= 120 && Math.abs(e - scripted[i][1]) <= 300);
  check(ok, `${c.displayName} speaking turns detected`, got.map(([s, e]) => `${(s / 1000).toFixed(2)}–${(e / 1000).toFixed(2)}s`).join(', ') + ` vs ${scripted.map(([s, e]) => `${s / 1000}–${e / 1000}s`).join(', ')}`);
}

const both = overlap(segments(events, 'p-ava'), segments(events, 'p-ben'));
check(both > 500,'overlapping speech (Ava + Ben laughing) captured', `${both} ms of overlap`);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);

function lines(path) {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function segments(evts, peer) {
  const out = [];
  let start;
  for (const e of evts.filter((x) => x.peer === peer)) {
    if (e.type === 'speaking_started') start = e.startedMs;
    if (e.type === 'speaking_stopped' && start !== undefined) { out.push([start, e.endedMs]); start = undefined; }
  }
  return out;
}
function overlap(a, b) {
  let total = 0;
  for (const [s1, e1] of a) for (const [s2, e2] of b) total += Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
  return total;
}
function newest(root, prefix) {
  const dirs = readdirSync(root).filter((d) => d.startsWith(prefix)).map((d) => join(root, d));
  if (!dirs.length) { console.error('No mock recordings yet: npm run record:mock'); process.exit(1); }
  return dirs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

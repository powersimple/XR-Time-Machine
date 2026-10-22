// Tests for the panel logic against a fake Premiere.
//   node test/lib.test.js [path/to/studio/project.json]
// With no argument it uses the newest studio export under ../../Altspace/recordings.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../lib.js');
const { createFake } = require('./fake-premiere.js');

function newestProject() {
  const root = path.join(__dirname, '../../../Altspace/recordings');
  // Skip test-studio: the studio test leaves it with a deliberately edited one-shot cut.
  const dirs = fs.readdirSync(root).filter((d) => d !== 'test-studio').map((d) => path.join(root, d, 'studio', 'project.json')).filter((p) => fs.existsSync(p));
  if (!dirs.length) throw new Error('No studio export found: run `npm run studio -- --latest` in Altspace first.');
  return dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

const projectPath = process.argv[2] ?? newestProject();
const studio = lib.parseProject(fs.readFileSync(projectPath, 'utf8'));
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// A Premiere project holding the imported timeline: every camera clip in a bin, V1 cut like the studio shots.
function imported() {
  const f = createFake();
  const clips = new Map(studio.cameras.map((c) => [c.id, new f.ClipProjectItem(path.basename(c.path), c.path)]));
  f.project.root.items.push(new f.FolderItem('XR Time Machine', [new f.FolderItem('cameras', [...clips.values()])]));
  const v1 = new f.Track(studio.shots.map((s) => new f.TrackItem(clips.get(s.camera), s.start / studio.fps, s.end / studio.fps, s.start / studio.fps)));
  const seq = new f.Sequence(studio.sequenceName, 'seq-1', [v1]);
  f.project.sequences.push(seq);
  f.project.active = seq;
  return { ...f, clips, seq, v1 };
}

test('parses the studio project', () => {
  assert.ok(studio.cameras.length >= 3, 'cameras');
  assert.ok(studio.cameras.every((c) => c.path && fs.existsSync(c.path)), 'every camera has a movie on disk');
  assert.ok(studio.files.sequence && fs.existsSync(studio.files.sequence), 'sequence.xml exists');
  assert.ok(studio.sequenceName, 'sequence name');
  assert.equal(studio.shots[0].start, 0);
  assert.equal(studio.shots.at(-1).end, studio.frames);
});

test('lists speech turns in time order with names', () => {
  const turns = lib.speechTurns(studio);
  // Some platforms (ENGAGE) have no per-speaker audio, so no turns; when there is speech, there must be turns.
  assert.equal(turns.length > 0, studio.speech.some((s) => s.turns.length > 0));
  for (let i = 1; i < turns.length; i++) assert.ok(turns[i].start >= turns[i - 1].start);
  assert.ok(turns.every((t) => t.name && t.end > t.start));
});

test('timecode', () => {
  assert.equal(lib.timecode(0, 30), '00:00:00:00');
  assert.equal(lib.timecode(61.5, 30), '00:01:01:15');
  assert.equal(lib.timecode(3600 + 2 / 30, 30), '01:00:00:02');
});

test('reading the cut back from V1 reproduces the studio shots', async () => {
  const f = imported();
  const { shots, unknown } = await lib.readCut(f.ppro, studio);
  assert.deepEqual(unknown, []);
  assert.deepEqual(shots.map((s) => [s.start, s.end, s.camera]), studio.shots.map((s) => [s.start, s.end, s.camera]));
});

test('reading the cut maps clips by media path even if renamed, and reports foreign clips', async () => {
  const f = imported();
  f.v1.items[0].clip.name = 'Renamed in the bin';
  const title = new f.ClipProjectItem('Title card', '/elsewhere/title.png');
  f.v1.items.push(new f.TrackItem(title, studio.frames / studio.fps, studio.frames / studio.fps + 2, 0));
  const { shots, unknown } = await lib.readCut(f.ppro, studio);
  assert.equal(shots[0].camera, studio.shots[0].camera);
  assert.deepEqual(unknown, ['Title card']);
});

test('switching angle at the playhead replaces exactly that clip with the same moment from the new camera', async () => {
  const f = imported();
  const target = studio.shots[1] ?? studio.shots[0];
  const mid = ((target.start + target.end) / 2) / studio.fps;
  f.seq.position = mid;
  const other = studio.cameras.find((c) => c.id !== target.camera && c.id !== 'program');
  const r = await lib.switchAngleAtPlayhead(f.ppro, studio, other.id);
  assert.equal(r.to, other.label);
  const items = f.v1.getTrackItems(1);
  assert.equal(items.length, studio.shots.length, 'same number of clips');
  const replaced = items.find((it) => mid >= it.start && mid < it.end);
  assert.equal(replaced.clip.mediaPath, other.path, 'new camera under the playhead');
  assert.equal(replaced.start, target.start / studio.fps);
  assert.equal(replaced.end, target.end / studio.fps);
  assert.equal(replaced.inPoint, target.start / studio.fps, 'same moment of the recording');
  assert.equal(f.clips.get(other.id).inOut, null, 'in/out marks cleared afterwards');
  // Neighbours untouched.
  if (studio.shots.length > 1) assert.equal(items[0].clip.mediaPath, studio.cameras.find((c) => c.id === studio.shots[0].camera).path);
  assert.ok(f.project.log.every((l) => !/outside lockedAccess/.test(l)));
  assert.equal(f.project.log.filter((l) => l.startsWith('XR Time Machine')).length, 3, 'mark, overwrite, clear');
});

test('switch angle explains what is missing', async () => {
  const f = imported();
  f.seq.position = studio.frames / studio.fps + 10;
  await assert.rejects(lib.switchAngleAtPlayhead(f.ppro, studio, studio.cameras[0].id), /No program clip under the playhead/);
  const empty = createFake();
  empty.project.active = new empty.Sequence('x', 'g', [new empty.Track([new empty.TrackItem(new empty.ClipProjectItem('a', studio.cameras[1].path), 0, 5, 0)])]);
  await assert.rejects(lib.switchAngleAtPlayhead(empty.ppro, studio, studio.cameras[0].id), /import the timeline first/);
});

test('importing the timeline makes the new sequence active', async () => {
  const f = createFake();
  f.project.importer = () => { f.project.sequences.push(new f.Sequence(studio.sequenceName, 'new-guid', [new f.Track([])])); return true; };
  const seq = await lib.importTimeline(f.ppro, studio.files.sequence, studio.sequenceName);
  assert.equal(seq.name, studio.sequenceName);
  assert.equal(f.project.active, seq);
  assert.match(f.project.log[0], /import .*sequence\.xml true null false/);
});

test('seek moves the playhead', async () => {
  const f = imported();
  await lib.seek(f.ppro, 4.25);
  assert.equal(f.seq.position, 4.25);
});

test('edits write back into project.json, keeping everything else', () => {
  const shots = [{ start: 0, end: studio.frames, camera: studio.cameras[0].id, transition: null }];
  const json = JSON.parse(lib.updatedProjectJson(studio, { shots, audioModes: { x: 'spatial' } }));
  assert.deepEqual(json.shots, shots);
  assert.equal(json.audio.modes.x, 'spatial');
  assert.deepEqual(json.cameras, studio.raw.cameras);
  assert.ok(json.editedInPremiereAt);
});

(async () => {
  let failed = 0;
  console.log(`Panel logic tests against ${projectPath}\n`);
  for (const t of tests) {
    try { await t.fn(); console.log(`pass  ${t.name}`); } catch (e) { failed++; console.log(`FAIL  ${t.name}\n      ${e.message}`); }
  }
  console.log(failed ? `\n${failed} failed` : `\nAll ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();

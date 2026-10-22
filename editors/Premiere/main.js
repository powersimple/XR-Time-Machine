// XR Time Machine panel UI. Logic lives in lib.js (tested in Node); this file wires it to the panel.
const ppro = require('premierepro');
const { storage } = require('uxp');
const lib = require('./lib.js');

const fs = storage.localFileSystem;
const $ = (id) => document.getElementById(id);
const COLORS = ['#ffa64d', '#5cc8ff', '#8ce678', '#ff78a0', '#c8a0ff', '#ffdc5a', '#5ae6d2', '#ff8c6e', '#aac8ff', '#e6e6e6'];

let folder = null; // the recording folder (UXP Folder entry)
let studio = null; // parsed studio/project.json

function log(msg, kind = '') {
  const line = document.createElement('div');
  line.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  if (kind) line.className = kind;
  $('log').insertBefore(line, $('log').firstChild); // newest first
}

async function guard(label, fn) {
  try { return await fn(); } catch (error) { log(`${label}: ${error.message ?? error}`, 'bad'); return undefined; }
}

async function readJson(dir, path) {
  let entry = dir;
  for (const part of path.split('/')) entry = await entry.getEntry(part);
  return JSON.parse(await entry.read());
}

async function open(dir) {
  folder = dir;
  $('folder').textContent = dir.nativePath;
  $('reload').disabled = false;
  const session = await guard('Reading session.json', () => readJson(dir, 'session.json'));
  if (!session) { $('ready').classList.add('hidden'); $('summary').textContent = 'Not a recording folder (no session.json).'; return; }
  const people = Object.values(session.peers ?? {}).length;
  const base = `${session.label ?? 'Recording'} · ${(session.durationMs / 1000).toFixed(1)} s · ${people} ${people === 1 ? 'person' : 'people'} · ${session.source?.platform ?? 'unknown platform'}`;
  const project = await guard('Reading studio/project.json', async () => lib.parseProject(await readJson(dir, 'studio/project.json')));
  if (!project) {
    $('summary').textContent = `${base} · not exported yet: run the command below, then Reload.`;
    $('cmd').textContent = lib.exportCommand(dir.nativePath);
    $('ready').classList.add('hidden');
    return;
  }
  studio = project;
  $('summary').textContent = `${base} · ${project.cameras.length} cameras · ${project.shots.length} shots`;
  $('cmd').textContent = lib.exportCommand(dir.nativePath);
  renderCameras();
  renderSpeech();
  renderPeople();
  $('ready').classList.remove('hidden');
  try { localStorage.setItem('xrtm.folder', await fs.createPersistentToken(dir)); } catch { /* remembering is a convenience */ }
  log(`Opened ${session.label ?? dir.name}`, 'ok');
}

function renderCameras() {
  $('cams').innerHTML = '';
  for (const cam of studio.cameras) {
    const b = document.createElement('button');
    b.textContent = cam.label;
    b.title = `Switch the program clip under the playhead to ${cam.label}`;
    b.addEventListener('click', () => guard(`Switch to ${cam.label}`, async () => {
      const r = await lib.switchAngleAtPlayhead(ppro, studio, cam.id);
      log(`${lib.timecode(r.start, studio.fps)}–${lib.timecode(r.end, studio.fps)}: ${r.from} → ${r.to}`, 'ok');
    }));
    $('cams').appendChild(b);
  }
}

function renderSpeech() {
  const who = $('who');
  who.innerHTML = '<option value="">Everyone</option>';
  for (const s of studio.speech) {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = `${s.name} (${s.turns.length})`;
    who.appendChild(o);
  }
  renderTurns();
}

function renderTurns() {
  const only = $('who').value;
  const ids = studio.speech.map((s) => s.id);
  $('turns').innerHTML = '';
  for (const t of lib.speechTurns(studio).filter((x) => !only || x.id === only)) {
    const row = document.createElement('div');
    row.className = 'turn';
    row.innerHTML = `<div class="dot"></div><span class="tc"></span><span class="grow"></span><span class="tc"></span>`;
    row.children[0].style.background = COLORS[ids.indexOf(t.id) % COLORS.length];
    row.children[1].textContent = lib.timecode(t.start, studio.fps);
    row.children[2].textContent = t.name;
    row.children[3].textContent = `${(t.end - t.start).toFixed(1)}s`;
    row.addEventListener('click', () => guard('Jump', () => lib.seek(ppro, t.start)));
    $('turns').appendChild(row);
  }
}

function renderPeople() {
  $('people').innerHTML = '';
  for (const s of studio.speech) {
    const row = document.createElement('div');
    row.className = 'person';
    const name = document.createElement('span');
    name.textContent = s.name;
    const pick = document.createElement('select');
    pick.setAttribute('data-id', s.id);
    for (const [v, label] of [['micd', "Mic'd"], ['spatial', 'Spatial']]) {
      const o = document.createElement('option'); o.value = v; o.textContent = label; pick.appendChild(o);
    }
    pick.value = studio.audio.modes?.[s.id] ?? studio.audio.defaultMode ?? 'micd';
    row.append(name, pick);
    $('people').appendChild(row);
  }
}

async function writeProject(json) {
  const dir = await folder.getEntry('studio');
  const file = await dir.getEntry('project.json');
  await (await dir.createFile('project.backup.json', { overwrite: true })).write(await file.read());
  await file.write(json);
}

$('open').addEventListener('click', () => guard('Open', async () => { const dir = await fs.getFolder(); if (dir) await open(dir); }));
$('reload').addEventListener('click', () => guard('Reload', () => folder && open(folder)));
$('who').addEventListener('change', renderTurns);

$('import').addEventListener('click', () => guard('Import', async () => {
  const xml = studio.files.sequence ?? `${folder.nativePath}/studio/sequence.xml`;
  log('Importing… (Premiere may take a moment to index the camera movies)');
  const seq = await lib.importTimeline(ppro, xml, studio.sequenceName);
  log(seq ? `Imported "${seq.name}" and made it the active sequence.` : 'Imported. Open the new sequence from the Project panel.', 'ok');
}));

$('readcut').addEventListener('click', () => guard('Read cut', async () => {
  const { shots, unknown } = await lib.readCut(ppro, studio);
  if (!shots.length) throw new Error('No camera clips found on V1 of the active sequence.');
  await writeProject(lib.updatedProjectJson(studio, { shots }));
  studio = lib.parseProject(JSON.parse(lib.updatedProjectJson(studio, { shots })));
  log(`Saved ${shots.length} shots to studio/project.json (previous saved as project.backup.json).${unknown.length ? ` Ignored non-camera clips: ${unknown.join(', ')}.` : ''} Re-export to render the program.`, 'ok');
}));

$('saveaudio').addEventListener('click', () => guard('Save audio modes', async () => {
  const modes = {};
  for (const pick of $('people').querySelectorAll('select')) modes[pick.getAttribute('data-id')] = pick.value;
  await writeProject(lib.updatedProjectJson(studio, { audioModes: modes }));
  studio.audio = { ...studio.audio, modes };
  log('Saved audio modes. Re-export to render mix-program.wav with them.', 'ok');
}));

$('copy').addEventListener('click', () => guard('Copy', async () => { await navigator.clipboard.writeText($('cmd').textContent); log('Command copied.', 'ok'); }));

// Reopen the last recording, if Premiere still lets us.
(async () => {
  try {
    const token = localStorage.getItem('xrtm.folder');
    if (token) await open(await fs.getEntryForPersistentToken(token));
  } catch { /* the folder moved or permission lapsed: the user can open it again */ }
})();

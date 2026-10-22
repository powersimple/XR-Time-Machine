// XR Time Machine panel logic. Pure functions plus Premiere operations that take the `premierepro` module as a
// parameter, so the same code runs in the panel and in Node tests (test/lib.test.js) against a fake API.
// CommonJS, because UXP's require() loads plugin files that way.
'use strict';

const norm = (p) => String(p ?? '').replace(/\\/g, '/').replace(/^file:\/\/(localhost)?/, '').replace(/\/+$/, '').toLowerCase();

// The studio project (studio/project.json, written by `npm run studio`) in the shape the panel uses.
function parseProject(json) {
  const p = typeof json === 'string' ? JSON.parse(json) : json;
  if (p.format !== 'xr-time-machine-studio') throw new Error('Not an XR Time Machine studio project (project.json)');
  const files = p.files ?? {};
  return {
    raw: p,
    fps: p.fps,
    frames: p.frames,
    seconds: p.frames / p.fps,
    sequenceName: p.sequenceName ?? null,
    cameras: p.cameras.map((c) => ({ id: c.id, label: c.label, type: c.type, path: files.cameras?.[c.id] ?? null })),
    shots: p.shots,
    audio: p.audio ?? { defaultMode: 'micd', modes: {} },
    speech: p.speech ?? [],
    files,
  };
}

// Every speech turn, in time order, for the panel's list.
function speechTurns(project) {
  return project.speech
    .flatMap((s) => s.turns.map((t) => ({ id: s.id, name: s.name, start: t.start / 1000, end: t.end / 1000 })))
    .sort((a, b) => a.start - b.start);
}

function cameraForMediaPath(project, mediaPath) {
  const target = norm(mediaPath);
  return project.cameras.find((c) => c.path && norm(c.path) === target) ?? null;
}

// Track items of the program track ([{ name, start, end, mediaPath }], seconds) → studio shots (frames).
// Clips that aren't one of the project's cameras are reported, not guessed.
function shotsFromClips(project, clips) {
  const shots = [];
  const unknown = [];
  for (const c of [...clips].sort((a, b) => a.start - b.start)) {
    const cam = cameraForMediaPath(project, c.mediaPath) ?? project.cameras.find((x) => x.label === c.name || `${x.label}.mov` === c.name);
    if (!cam) { unknown.push(c.name); continue; }
    shots.push({ start: Math.round(c.start * project.fps), end: Math.round(c.end * project.fps), camera: cam.id, transition: null });
  }
  // Keep the cut gap-free: each shot runs to the next one's start.
  for (let i = 0; i < shots.length - 1; i++) shots[i].end = shots[i + 1].start;
  return { shots, unknown };
}

// project.json with new shots and/or audio modes, ready to write back for re-export.
function updatedProjectJson(project, { shots, audioModes } = {}) {
  const raw = JSON.parse(JSON.stringify(project.raw));
  if (shots) raw.shots = shots;
  if (audioModes) raw.audio = { ...(raw.audio ?? { defaultMode: 'micd' }), modes: audioModes };
  raw.editedInPremiereAt = new Date().toISOString();
  return JSON.stringify(raw, null, 2);
}

function exportCommand(recordingPath) {
  return `cd "<XR-TimeMachine>/Altspace" && npm run studio -- "${recordingPath}"`;
}

const timecode = (seconds, fps) => {
  const f = Math.round(seconds * fps);
  const s = Math.floor(f / fps);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, f % fps].map((n) => String(n).padStart(2, '0')).join(':');
};

// ---- Premiere operations (ppro = require('premierepro')) ----

async function activeSequence(ppro) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error('Open a Premiere project first.');
  const sequence = await project.getActiveSequence();
  return { project, sequence };
}

// Import studio/sequence.xml; returns the new sequence (made active) if Premiere created one we can find.
async function importTimeline(ppro, xmlPath, sequenceName) {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error('Open a Premiere project first.');
  const before = new Set((await project.getSequences()).map((s) => String(s.guid)));
  const ok = await project.importFiles([xmlPath], true, null, false);
  if (!ok) throw new Error(`Premiere could not import ${xmlPath}`);
  const after = await project.getSequences();
  const added = after.filter((s) => !before.has(String(s.guid)));
  const seq = added.find((s) => s.name === sequenceName) ?? added[0] ?? after.find((s) => s.name === sequenceName) ?? null;
  if (seq) await project.setActiveSequence(seq);
  return seq;
}

async function seek(ppro, seconds) {
  const { sequence } = await activeSequence(ppro);
  if (!sequence) throw new Error('No active sequence.');
  await sequence.setPlayerPosition(ppro.TickTime.createWithSeconds(seconds));
}

// The clips on the program track (V1) as plain data.
async function programClips(ppro, sequence) {
  const track = await sequence.getVideoTrack(0);
  const items = track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  const out = [];
  for (const item of items) {
    const projectItem = await item.getProjectItem();
    const clip = projectItem ? ppro.ClipProjectItem.cast(projectItem) : null;
    out.push({
      item,
      name: await item.getName(),
      start: (await item.getStartTime()).seconds,
      end: (await item.getEndTime()).seconds,
      inPoint: (await item.getInPoint()).seconds,
      mediaPath: clip ? await clip.getMediaFilePath() : null,
    });
  }
  return out;
}

async function readCut(ppro, project) {
  const { sequence } = await activeSequence(ppro);
  if (!sequence) throw new Error('No active sequence: open the imported XR Time Machine sequence.');
  return shotsFromClips(project, await programClips(ppro, sequence));
}

// Find the project item for a media file anywhere in the project's bins.
async function findClipByMediaPath(ppro, project, mediaPath) {
  const target = norm(mediaPath);
  const queue = [...(await (await project.getRootItem()).getItems())];
  while (queue.length) {
    const item = queue.shift();
    const clip = ppro.ClipProjectItem.cast(item);
    if (clip) {
      if (norm(await clip.getMediaFilePath()) === target) return clip;
      continue;
    }
    const folder = ppro.FolderItem.cast(item);
    if (folder) queue.push(...(await folder.getItems()));
  }
  return null;
}

// Multicam-style switch: replace the program clip under the playhead with the same span from another camera.
// Three transactions, so each step's result is in place before the next: mark the source range, overwrite, clear.
async function switchAngleAtPlayhead(ppro, studio, cameraId) {
  const { project, sequence } = await activeSequence(ppro);
  if (!sequence) throw new Error('No active sequence.');
  const cam = studio.cameras.find((c) => c.id === cameraId);
  if (!cam?.path) throw new Error(`No media file for camera ${cameraId}; re-export the studio project.`);
  const position = (await sequence.getPlayerPosition()).seconds;
  const clips = await programClips(ppro, sequence);
  const under = clips.find((c) => position >= c.start && position < c.end);
  if (!under) throw new Error('No program clip under the playhead (track V1).');
  const source = await findClipByMediaPath(ppro, project, cam.path);
  if (!source) throw new Error(`${cam.label} isn't in this project yet: import the timeline first.`);
  const length = under.end - under.start;
  const T = (s) => ppro.TickTime.createWithSeconds(s);
  const run = (label, build) => {
    let ok = false;
    project.lockedAccess(() => { ok = project.executeTransaction((compound) => compound.addAction(build()), label); });
    if (!ok) throw new Error(`${label} failed`);
  };
  const editor = ppro.SequenceEditor.getEditor(sequence);
  run(`XR Time Machine: mark ${cam.label}`, () => source.createSetInOutPointsAction(T(under.inPoint), T(under.inPoint + length)));
  try {
    run(`XR Time Machine: switch to ${cam.label}`, () => editor.createOverwriteItemAction(source, T(under.start), 0, 0));
  } finally {
    run(`XR Time Machine: clear marks on ${cam.label}`, () => source.createClearInOutPointsAction());
  }
  return { from: under.name, to: cam.label, start: under.start, end: under.end };
}

module.exports = {
  parseProject, speechTurns, cameraForMediaPath, shotsFromClips, updatedProjectJson, exportCommand, timecode,
  importTimeline, seek, readCut, switchAngleAtPlayhead, programClips, findClipByMediaPath,
};

// A small fake of the `premierepro` UXP module: enough of Project, Sequence, tracks, clips, bins and
// transactions to run lib.js in Node. Actions are applied when their transaction runs, like Premiere's.
'use strict';

class TickTime {
  constructor(seconds) { this.seconds = seconds; }
  static createWithSeconds(s) { return new TickTime(s); }
}

const Constants = { TrackItemType: { EMPTY: 0, CLIP: 1, TRANSITION: 2 } };

class ClipProjectItem {
  constructor(name, mediaPath) { this.name = name; this.mediaPath = mediaPath; this.inOut = null; this.kind = 'clip'; }
  static cast(item) { return item?.kind === 'clip' ? item : null; }
  async getMediaFilePath() { return this.mediaPath; }
  createSetInOutPointsAction(inT, outT) { return { apply: () => { this.inOut = [inT.seconds, outT.seconds]; }, describe: `setInOut ${this.name}` }; }
  createClearInOutPointsAction() { return { apply: () => { this.inOut = null; }, describe: `clearInOut ${this.name}` }; }
}

class FolderItem {
  constructor(name, items) { this.name = name; this.items = items; this.kind = 'folder'; }
  static cast(item) { return item?.kind === 'folder' ? item : null; }
  async getItems() { return this.items; }
}

class TrackItem {
  constructor(clip, start, end, inPoint) { Object.assign(this, { clip, start, end, inPoint }); }
  async getName() { return this.clip.name; }
  async getStartTime() { return new TickTime(this.start); }
  async getEndTime() { return new TickTime(this.end); }
  async getInPoint() { return new TickTime(this.inPoint); }
  async getProjectItem() { return this.clip; }
}

class Track {
  constructor(items) { this.items = items; }
  getTrackItems(type) { if (type !== Constants.TrackItemType.CLIP) throw new Error('fake: only CLIP'); return [...this.items].sort((a, b) => a.start - b.start); }
  // Overwrite [at, at + length) with `clip` from its marked in point, trimming whatever was there.
  overwrite(clip, at) {
    if (!clip.inOut) throw new Error('fake: overwrite needs in/out marks (the real one would use the whole clip)');
    const [i, o] = clip.inOut;
    const end = at + (o - i);
    const kept = [];
    for (const it of this.items) {
      if (it.end <= at || it.start >= end) { kept.push(it); continue; }
      if (it.start < at) kept.push(new TrackItem(it.clip, it.start, at, it.inPoint));
      if (it.end > end) kept.push(new TrackItem(it.clip, end, it.end, it.inPoint + (end - it.start)));
    }
    kept.push(new TrackItem(clip, at, end, i));
    this.items = kept;
  }
}

class Sequence {
  constructor(name, guid, tracks) { Object.assign(this, { name, guid, tracks, position: 0 }); }
  async getVideoTrack(i) { return this.tracks[i]; }
  async getPlayerPosition() { return new TickTime(this.position); }
  async setPlayerPosition(t) { this.position = t.seconds; }
}

const SequenceEditor = {
  getEditor(sequence) {
    return {
      createOverwriteItemAction(clip, time, videoTrackIndex) {
        return { apply: () => sequence.tracks[videoTrackIndex].overwrite(clip, time.seconds), describe: `overwrite V${videoTrackIndex + 1} at ${time.seconds}` };
      },
    };
  },
};

class Project {
  constructor() { this.sequences = []; this.active = null; this.root = new FolderItem('root', []); this.log = []; this.locked = false; this.importer = null; }
  async getActiveSequence() { return this.active; }
  async setActiveSequence(s) { this.active = s; return true; }
  async getSequences() { return this.sequences; }
  async getRootItem() { return this.root; }
  async importFiles(paths, suppressUI, bin, asStills) { this.log.push(`import ${paths.join(',')} ${suppressUI} ${bin} ${asStills}`); return this.importer ? this.importer(paths) : true; }
  lockedAccess(fn) { this.locked = true; try { fn(); } finally { this.locked = false; } }
  executeTransaction(fn, label) {
    if (!this.locked) throw new Error('fake: executeTransaction outside lockedAccess (Premiere 26.3 requires it)');
    const actions = [];
    fn({ addAction: (a) => actions.push(a) });
    for (const a of actions) a.apply();
    this.log.push(`${label}: ${actions.map((a) => a.describe).join('; ')}`);
    return true;
  }
}

function createFake() {
  const project = new Project();
  return { project, ppro: { Project: { getActiveProject: async () => project }, TickTime, Constants, ClipProjectItem, FolderItem, SequenceEditor }, ClipProjectItem, FolderItem, Track, TrackItem, Sequence };
}

module.exports = { createFake };

// The auto-director: turns who-is-speaking into a program cut, like a live multicam switcher.
// Rules: open on the wide (an establishing shot); one person speaking → their close-up (else the speaker
// camera); several at once → the wide; nobody for a while → the wide. A shot is held at least `minShotS` before
// cutting again, or only `minResponsiveS` when the person on screen has stopped and someone else has started
// (holding a silent close-up while the next person talks looks late). Cuts to a close-up land a few frames before
// the speaker starts (editors cut on the breath); going back to the wide dissolves.
// The result is data ([{ start, end, camera, transition }], in frames), so every decision stays editable.

export function direct(rec, cameras, fps, frames, { minShotS = 2, minResponsiveS = 0.8, establishS = 2, wideAfterSilenceS = 2.5, leadFrames = 4, dissolveFrames = 12 } = {}) {
  // No speech information at all (e.g. converted from a platform that only stores a mixed track): tour the cameras.
  if (![...rec.peers.values()].some((p) => p.turns.length)) return tour(cameras, fps, frames, dissolveFrames);
  const ids = new Set(cameras.map((c) => c.id));
  const wide = ids.has('wide') ? 'wide' : cameras[0].id;
  const closeOf = (peer) => (ids.has(`close-${peer}`) ? `close-${peer}` : ids.has('speaker') ? 'speaker' : wide);
  const want = new Array(frames);
  let silentSince = 0;
  for (let f = 0; f < frames; f++) {
    const t = ((f + leadFrames) / fps) * 1000; // look a few frames ahead so cuts lead the speech
    const speakers = rec.speakersAt(t);
    if (speakers.length === 1) { want[f] = closeOf(speakers[0]); silentSince = f; }
    else if (speakers.length > 1) { want[f] = wide; silentSince = f; }
    else want[f] = f - silentSince > wideAfterSilenceS * fps ? wide : null; // hold the current shot briefly
  }
  const subjectOf = (camera) => cameras.find((c) => c.id === camera)?.subject ?? null;
  const shots = [];
  let cur = { start: 0, camera: wide, transition: null };
  for (let f = Math.min(frames, Math.round(establishS * fps)); f < frames; f++) {
    const w = want[f];
    if (!w || w === cur.camera) continue;
    const onScreen = subjectOf(cur.camera);
    const stale = onScreen && !rec.speakersAt(((f + leadFrames) / fps) * 1000).includes(onScreen);
    if (f - cur.start < (stale ? minResponsiveS : minShotS) * fps) continue;
    cur.end = f;
    shots.push(cur);
    cur = { start: f, camera: w, transition: w === wide ? { type: 'dissolve', frames: dissolveFrames } : null };
  }
  cur.end = frames;
  shots.push(cur);
  return shots;
}

// A steady tour when nobody's speech is known: wide, orbit, then the close-ups in turn, with the wide and the
// overhead in between, dissolving between shots.
function tour(cameras, fps, frames, dissolveFrames) {
  const has = (id) => cameras.some((c) => c.id === id);
  const closes = cameras.filter((c) => c.type === 'follow').map((c) => c.id);
  const order = [...['wide', 'orbit'].filter(has)];
  closes.forEach((id, i) => { order.push(id); if (i % 2 === 1) order.push(i % 4 === 1 ? 'overhead' : 'wide'); });
  const seq = order.filter((id) => has(id));
  const lengthOf = (id) => Math.round((id.startsWith('close-') ? 5 : 7) * fps);
  const shots = [];
  for (let f = 0, i = 0; f < frames; i++) {
    const camera = seq[i % seq.length];
    const end = Math.min(frames, f + lengthOf(camera));
    shots.push({ start: f, end, camera, transition: f ? { type: 'dissolve', frames: dissolveFrames } : null });
    f = end;
  }
  return shots;
}

// Which camera(s) the program shows at frame f: [{ camera, weight }] (two during a dissolve).
export function programAt(shots, f) {
  const i = shots.findIndex((s) => f >= s.start && f < s.end);
  const shot = shots[i];
  const tr = shot.transition;
  if (tr && i > 0 && f < shot.start + tr.frames / 2) {
    // Centred dissolve: half before the cut, half after.
    const k = (f - (shot.start - tr.frames / 2)) / tr.frames;
    return [{ camera: shots[i - 1].camera, weight: 1 - k }, { camera: shot.camera, weight: k }];
  }
  const next = shots[i + 1];
  if (next?.transition && f >= next.start - next.transition.frames / 2) {
    const k = (f - (next.start - next.transition.frames / 2)) / next.transition.frames;
    return [{ camera: shot.camera, weight: 1 - k }, { camera: next.camera, weight: k }];
  }
  return [{ camera: shot.camera, weight: 1 }];
}

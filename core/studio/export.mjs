// Studio export: turns a recording into editor-ready media and timelines, in <recording>/studio/.
//   cameras/<Camera>.mov    one iso movie per virtual camera (Photo-JPEG QuickTime), label and timecode burned in
//   program.mov             the auto-director's cut, clean
//   mix-micd.wav            program audio, everyone dry (lavalier style)
//   mix-spatial.wav         program audio, voices placed from the program camera
//   sequence.xml            FCP7 XML for Premiere (File > Import), layout in ./timeline.mjs
//   timeline.otio           the same as OpenTimelineIO
//   project.json            cameras, cut list and audio modes: edit and re-export to change decisions
// Each movie renders in its own worker thread (one per camera, one for the program), so exports scale with cores.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { loadRecording } from './recording.mjs';
import { cameraPath, defaultCameras } from './cameras.mjs';
import { direct, programAt } from './director.mjs';
import { mixProgram, stereoWav } from './mix.mjs';
import { otio, xmeml } from './timeline.mjs';

const safe = (s) => s.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-') || 'camera';

// codecsModule: URL of a module exporting `codecs` (the platform plugin's bone codecs), for the render workers.
export async function exportStudio(dir, { codecs = {}, codecsModule = null, workers = Math.max(1, availableParallelism() - 1), width = 1280, height = 720, fps = 30, quality = 85, maxCloseUps = 8, seconds = null, onProgress = () => {} } = {}) {
  const started = performance.now();
  const rec = loadRecording(dir, { codecs });
  const out = join(dir, 'studio');
  mkdirSync(join(out, 'cameras'), { recursive: true });
  const frames = Math.floor(((seconds ? Math.min(seconds * 1000, rec.durationMs) : rec.durationMs) / 1000) * fps);

  // A project.json from a previous export keeps its edited cameras, cut and audio modes.
  const projectPath = join(out, 'project.json');
  const saved = existsSync(projectPath) ? JSON.parse(readFileSync(projectPath, 'utf8')) : null;
  const cameras = saved?.cameras ?? defaultCameras(rec, { maxCloseUps });
  const shots = saved?.shots && saved.frames === frames ? saved.shots : direct(rec, cameras, fps, frames);
  const audio = saved?.audio ?? { defaultMode: 'micd', modes: {} };

  const paths = new Map(cameras.map((c) => [c.id, cameraPath(rec, c, fps, frames)]));
  const files = cameras.map((c) => ({ id: c.id, label: c.label, path: resolve(out, 'cameras', `${safe(c.label)}.mov`) }));
  // Render every movie in parallel: one task per iso camera plus the program, at most `workers` at a time.
  const tasks = [...files.map((f) => ({ kind: 'iso', camera: f.id, path: f.path })), { kind: 'program', path: resolve(out, 'program.mov') }];
  const progress = new Map(tasks.map((t) => [t.path, 0]));
  const report = () => onProgress({ frame: [...progress.values()].reduce((a, b) => a + b, 0) / tasks.length, frames });
  const queue = [...tasks];
  const run = async () => {
    for (let task; (task = queue.shift());) {
      await new Promise((resolveTask, reject) => {
        const worker = new Worker(new URL('./render-worker.mjs', import.meta.url), {
          workerData: { dir: resolve(dir), codecsModule, task, cameras, shots, frames, width, height, fps, quality },
        });
        worker.on('message', (m) => { if (m.progress !== undefined) { progress.set(task.path, m.progress); report(); } if (m.done) { progress.set(task.path, frames); resolveTask(); } });
        worker.on('error', reject);
        worker.on('exit', (code) => (code ? reject(new Error(`render worker for ${task.camera ?? 'program'} exited with ${code}`)) : resolveTask()));
      });
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, run));

  // Audio: both program mixes follow the program camera (the dominant one during a dissolve).
  const cameraAt = (f) => { const l = programAt(shots, f); return paths.get((l[1] && l[1].weight > 0.5 ? l[1] : l[0]).camera)[f]; };
  const rate = rec.session.voiceSampleRate;
  writeFileSync(join(out, 'mix-micd.wav'), stereoWav(mixProgram(rec, { fps, frames, cameraAt, defaultMode: 'micd', modes: {} }), rate));
  writeFileSync(join(out, 'mix-spatial.wav'), stereoWav(mixProgram(rec, { fps, frames, cameraAt, defaultMode: 'spatial', modes: {} }), rate));
  if (Object.keys(audio.modes).length) writeFileSync(join(out, 'mix-program.wav'), stereoWav(mixProgram(rec, { fps, frames, cameraAt, ...audio }), rate));

  const stems = [...rec.peers.values()].filter((p) => p.voiceFile).map((p) => ({ id: p.id, name: p.name, path: resolve(dir, p.voiceFile) }));
  const media = { cameras: files, program: { path: resolve(out, 'program.mov') }, mixes: { micd: resolve(out, 'mix-micd.wav'), spatial: resolve(out, 'mix-spatial.wav') }, stems };
  const markers = [];
  for (const p of rec.peers.values()) for (const t of p.turns) {
    if (t.start / 1000 * fps >= frames) continue;
    markers.push({ name: `${p.name} speaking`, comment: p.id, frame: Math.round((t.start / 1000) * fps), endFrame: Math.min(frames, Math.round((t.end / 1000) * fps)) });
  }
  for (const e of rec.events.filter((x) => x.type === 'peer_joined' || x.type === 'peer_left')) {
    const frame = Math.round((e.t / 1000) * fps);
    if (frame < frames) markers.push({ name: `${rec.peers.get(e.peer)?.name ?? e.peer} ${e.type === 'peer_joined' ? (e.rejoin ? 'rejoined' : 'joined') : 'left'}`, comment: e.peer, frame, color: 'GREEN' });
  }
  markers.sort((a, b) => a.frame - b.frame);
  const name = `${rec.session.label ?? 'Recording'} (XR Time Machine)`;
  writeFileSync(join(out, 'sequence.xml'), xmeml({ name, fps, frames, width, height, shots, cameras, media, markers }));
  writeFileSync(join(out, 'timeline.otio'), otio({ name, fps, frames, shots, cameras, media, markers }));
  writeFileSync(projectPath, JSON.stringify({
    format: 'xr-time-machine-studio', version: 1, recording: resolve(dir), sequenceName: name, fps, frames, width, height,
    cameras, shots, audio,
    files: { program: media.program.path, cameras: Object.fromEntries(files.map((f) => [f.id, f.path])), mixes: media.mixes, stems: Object.fromEntries(stems.map((s) => [s.id, s.path])), sequence: resolve(out, 'sequence.xml') },
    speech: [...rec.peers.values()].map((p) => ({ id: p.id, name: p.name, turns: p.turns })),
    note: 'Edit cameras, shots (frames) or audio.modes ({ peerId: "micd" | "spatial" }) and export again to apply.',
  }, null, 2));
  const seconds_ = ((performance.now() - started) / 1000).toFixed(1);
  return { out, frames, cameras: cameras.length, shots: shots.length, markers: markers.length, seconds: seconds_, workers: Math.min(workers, tasks.length) };
}

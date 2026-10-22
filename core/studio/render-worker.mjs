// Renders one movie of a studio export in a worker thread: an iso camera, or the program (composited from
// clean renders of whichever cameras the cut shows, with dissolves). Posts { progress } and finally { done }.
import { parentPort, workerData } from 'node:worker_threads';
import { loadRecording } from './recording.mjs';
import { cameraPath } from './cameras.mjs';
import { programAt } from './director.mjs';
import { renderFrame } from './render.mjs';
import { encodeJpeg } from './jpeg.mjs';
import { MovWriter } from './mov.mjs';

const { dir, codecsModule, task, cameras, shots, frames, width, height, fps, quality } = workerData;
const codecs = codecsModule ? (await import(codecsModule)).codecs : {};
const rec = loadRecording(dir, { codecs });

const tc = (f) => {
  const s = Math.floor(f / fps);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f % fps).padStart(2, '0')}`;
};

const writer = new MovWriter(task.path, { width, height, fps });
if (task.kind === 'iso') {
  const cam = cameras.find((c) => c.id === task.camera);
  const path = cameraPath(rec, cam, fps, frames);
  for (let f = 0; f < frames; f++) {
    const frame = renderFrame(rec, (f / fps) * 1000, path[f], { width, height, label: cam.label, timecode: tc(f) });
    writer.addFrame(encodeJpeg(frame.rgb, width, height, quality));
    if (f % 15 === 0) parentPort.postMessage({ progress: f });
  }
} else {
  const paths = new Map(cameras.map((c) => [c.id, cameraPath(rec, c, fps, frames)]));
  for (let f = 0; f < frames; f++) {
    const t = (f / fps) * 1000;
    const layers = programAt(shots, f);
    const frame = renderFrame(rec, t, paths.get(layers[0].camera)[f], { width, height });
    if (layers[1]) frame.mix(renderFrame(rec, t, paths.get(layers[1].camera)[f], { width, height }), layers[1].weight);
    writer.addFrame(encodeJpeg(frame.rgb, width, height, quality));
    if (f % 15 === 0) parentPort.postMessage({ progress: f });
  }
}
parentPort.postMessage({ done: writer.close() });

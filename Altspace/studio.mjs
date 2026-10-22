// Studio export for Altspace recordings: renders cameras, the auto-directed program, audio mixes and
// Premiere/OTIO timelines into <recording>/studio/ (see ../core/studio/export.mjs).
//   npm run studio -- <recording folder> [--width 1280 --height 720 --fps 30 --seconds 20]
//   npm run studio -- --latest            the newest recording in recordings/
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { exportStudio } from '../core/studio/export.mjs';
import { codecs } from './codec.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
let dir = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--latest'));
if (args.includes('--latest') || !dir) {
  const all = readdirSync('recordings').map((d) => join('recordings', d)).filter((d) => statSync(d).isDirectory());
  dir = all.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
if (!dir) { console.error('Usage: npm run studio -- <recording folder>'); process.exit(1); }

console.log(`Studio export of ${dir}`);
let shown = -1;
const result = await exportStudio(dir, {
  codecs, codecsModule: new URL('./codec.mjs', import.meta.url).href,
  width: Number(opt('width', 1280)), height: Number(opt('height', 720)), fps: Number(opt('fps', 30)),
  seconds: opt('seconds') ? Number(opt('seconds')) : null,
  onProgress: ({ frame, frames }) => { const pct = Math.round((frame / frames) * 100); if (pct !== shown) process.stdout.write(`\r  rendering ${(shown = pct)}%`); },
});
console.log(`\r  ${result.frames} frames, ${result.cameras} cameras, ${result.shots} shots, ${result.markers} markers in ${result.seconds}s (${result.workers} render workers)`);
console.log(`  → ${result.out}  (open sequence.xml in Premiere: File > Import)`);

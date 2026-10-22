// Studio export test: records the mock campfire scene, exports 4 s of it at low resolution, and checks the result.
//   npm run test:studio
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createMockRoomClient } from '../mock/mock-room.mjs';
import { buildScene } from '../mock/scenario.mjs';
import { scenarios } from '../mock/scenarios/index.mjs';
import { virtualClock } from '../../core/clock.mjs';
import { startRecorder } from '../../core/recorder.mjs';
import { exportStudio } from '../../core/studio/export.mjs';
import { openMov } from '../../core/studio/movframes.mjs';
import { altspaceSource } from '../adapter.mjs';
import { codecs } from '../codec.mjs';

const SECONDS = 4, W = 320, H = 180, FPS = 30;
const dir = join('recordings', 'test-studio');
rmSync(dir, { recursive: true, force: true });
let failures = 0;
const check = (ok, what, detail = '') => { console.log(`${ok ? 'pass' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`); if (!ok) failures++; };

// Record.
const scene = buildScene(scenarios.campfire);
const clock = virtualClock();
const { client } = createMockRoomClient({ clock, scene });
await client.joinRoom({});
const recorder = startRecorder({ source: altspaceSource(client), clock, outDir: dir, label: 'campfire' });
await clock.runFor(scene.durationMs);
await recorder.stop();
await client.leaveRoom();

// Export.
const t0 = performance.now();
const result = await exportStudio(dir, { codecs, codecsModule: new URL('../codec.mjs', import.meta.url).href, width: W, height: H, fps: FPS, seconds: SECONDS });
console.log(`Exported ${result.frames} frames, ${result.cameras} cameras in ${((performance.now() - t0) / 1000).toFixed(1)}s\n`);
const out = join(dir, 'studio');
const project = JSON.parse(readFileSync(join(out, 'project.json'), 'utf8'));

check(result.frames === SECONDS * FPS, 'frame count', `${result.frames}`);
check(project.cameras.length >= 7, 'default cameras: wide, overhead, orbit, speaker and a close-up per speaker', project.cameras.map((c) => c.id).join(', '));

// Every movie: right size and frame count, frames are JPEGs, and macOS can decode it.
const movies = [project.files.program, ...Object.values(project.files.cameras)];
for (const m of movies) {
  const mov = openMov(m);
  const frame = mov.frame(Math.floor(mov.frames / 2));
  check(mov.codec === 'jpeg' && mov.width === W && mov.height === H && mov.frames === SECONDS * FPS && frame[0] === 0xff && frame[1] === 0xd8,
    `${m.split('/').pop()} is ${W}×${H} Photo-JPEG with ${SECONDS * FPS} frames`, `${mov.codec} ${mov.width}×${mov.height}, ${mov.frames} frames`);
  mov.close();
}
if (process.platform === 'darwin') {
  try {
    execFileSync('avconvert', ['--source', project.files.program, '--preset', 'Preset640x480', '--output', join(dir, 'decode-check.mov'), '--replace'], { stdio: 'pipe', timeout: 120_000 });
    check(true, 'AVFoundation decodes program.mov');
  } catch (error) {
    check(false, 'AVFoundation decodes program.mov', String(error.stderr ?? error.message).slice(0, 200));
  }
}

// The cut: starts on the wide, covers every frame with no gaps or overlaps, only uses known cameras.
const shots = project.shots;
check(shots[0].camera === 'wide' && shots[0].start === 0, 'opens on the establishing wide');
check(shots.at(-1).end === result.frames && shots.every((s, i) => i === 0 || s.start === shots[i - 1].end), 'shots cover the timeline with no gaps');
check(shots.every((s) => project.cameras.some((c) => c.id === s.camera)), 'shots only use known cameras');

// Timelines.
const xml = readFileSync(project.files.sequence, 'utf8');
try { execFileSync('xmllint', ['--noout', project.files.sequence], { stdio: 'pipe' }); check(true, 'sequence.xml is well-formed'); } catch (e) { check(false, 'sequence.xml is well-formed', String(e.stderr).slice(0, 200)); }
const paths = [...xml.matchAll(/<pathurl>file:\/\/localhost(.*?)<\/pathurl>/g)].map((m) => decodeURIComponent(m[1]));
check(paths.length > 0 && paths.every((p) => existsSync(p)), 'every file the XML references exists', `${new Set(paths).size} files`);
check((xml.match(/<clipitem /g) ?? []).length >= shots.length + project.cameras.length, 'XML has the program cut plus every iso camera');
check((xml.match(/<marker>/g) ?? []).length > 0, 'XML has speech markers');
const otio = JSON.parse(readFileSync(join(out, 'timeline.otio'), 'utf8'));
check(otio.OTIO_SCHEMA === 'Timeline.1' && otio.tracks.children[0].name === 'Program', 'timeline.otio is an OTIO timeline with the program first');

// Audio mixes: stereo, 48 kHz, exactly the exported length, and not silent.
for (const mix of ['mix-micd.wav', 'mix-spatial.wav']) {
  const wav = readFileSync(join(out, mix));
  const channels = wav.readUInt16LE(22), rate = wav.readUInt32LE(24), samples = (wav.length - 44) / 4;
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  check(channels === 2 && rate === 48000 && samples === SECONDS * 48000 && peak > 1000, `${mix} is stereo 48 kHz, ${SECONDS} s, not silent`, `${channels} ch, ${rate} Hz, ${(samples / 48000).toFixed(2)} s, peak ${peak}`);
}

// Editing project.json and exporting again keeps the edited cut (the panel's round trip).
const edited = { ...project, shots: [{ start: 0, end: result.frames, camera: 'overhead', transition: null }] };
(await import('node:fs')).writeFileSync(join(out, 'project.json'), JSON.stringify(edited));
await exportStudio(dir, { codecs, codecsModule: new URL('../codec.mjs', import.meta.url).href, width: W, height: H, fps: FPS, seconds: SECONDS });
const again = JSON.parse(readFileSync(join(out, 'project.json'), 'utf8'));
check(again.shots.length === 1 && again.shots[0].camera === 'overhead', 're-export keeps an edited cut');
check(statSync(project.files.program).size > 0, 'program re-rendered');

console.log(failures ? `\n${failures} check(s) failed` : '\nStudio export checks passed');
process.exit(failures ? 1 : 0);

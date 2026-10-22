// Golden test: record the mock scene, then compare every output line and sample against the scene's ground truth.
//   npm run harness                       record instantly (virtual clock) and compare; exact timing expected
//   npm run harness -- --realtime         record in real time; sample times may drift, values must still match
//   npm run harness -- --compare <dir>    compare an existing recording without recording again
// Writes harness-report.txt into the recording folder, listing every mismatch by file and line.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { join } from 'node:path';
import { decodeBonePose, BONE_NAMES } from 'altspace.js';
import { createMockRoomClient } from '../mock/mock-room.mjs';
import { virtualClock, wallClock } from '../mock/clock.mjs';
import { SCENE_DURATION_MS, VOICE_SAMPLE_RATE } from '../mock/scene.mjs';
import { startRecorder } from '../recorder/recorder.mjs';
import { expectedEvents, expectedPoseLines, expectedVoice, truthAt } from './expected.mjs';

const TOL = {
  // A sampled value is the latest one published, so it must equal the scene at some moment within one
  // publish interval before the sample: root at 60 Hz, bones at 30 Hz. Timers run late in real time, so allow more there.
  rootStaleMs: 17,
  boneStaleMs: 34,
  realtimeExtraStaleMs: 25,
  // Within that window, only quantization error is allowed (the bone codec packs rotations into 32 bits).
  positionM: 0.001,
  rotationDeg: 0.5,
  boneDeg: 0.5,
  hipM: 0.001,
  sampleTimeMs: 20, // real-time mode only; instant mode must match exactly
  // Real-time mode: longest allowed hole between pose samples, in sample periods. A JS timer stall can drop
  // one frame now and then (~70 ms gap); a recorder that actually stops sampling shows up well past this.
  maxGapPeriods: 3,
  speechStartMs: 50,
  speechEndMs: 50,
  joinMs: 40,
  voiceLsb: 1,
  silenceLsb: 16,
};

const args = process.argv.slice(2);
const realtime = args.includes('--realtime');
const compareDir = args.includes('--compare') ? args[args.indexOf('--compare') + 1] : null;
const dir = compareDir ?? (await record());
const SESSION = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
// A virtual-clock recording is deterministic, so its timing must match exactly, however it's being compared.
const exactTiming = SESSION.clock === 'virtual';
// The worst event-loop stall measured while recording (real-time runs made by this harness), else an allowance.
const loopFile = join(dir, 'harness-loop.json');
const STALL_MS = exactTiming ? 0 : existsSync(loopFile) ? JSON.parse(readFileSync(loopFile, 'utf8')).maxStallMs : 100;
// Recording time + START = scene time. The recorder starts a moment after the room in real time.
const START = SESSION.startClockMs ?? 0;
const report = [];
const summary = [];
let failures = 0;
const fail = (where, msg) => { failures++; report.push(`${where}  ${msg}`); };

comparePoses();
compareEvents();
compareVoices();
compareSession();

const header = `Harness ${dir}  (${exactTiming ? 'instant: exact timing' : 'real-time: timing tolerant'})`;
writeFileSync(join(dir, 'harness-report.txt'), [header, '', ...summary, '', failures ? `${failures} mismatches:` : 'No mismatches.', ...report].join('\n') + '\n');
console.log(header + '\n');
for (const s of summary) console.log(s);
if (failures) {
  console.log(`\n${failures} mismatches (first 15 below; all in ${join(dir, 'harness-report.txt')})`);
  for (const r of report.slice(0, 15)) console.log(`  ${r}`);
} else console.log('\nEvery line matches the scene.');
process.exit(failures ? 1 : 0);

async function record() {
  const clock = realtime ? wallClock() : virtualClock();
  const { client, durationMs } = createMockRoomClient({ clock, displayName: 'Recorder' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = join('recordings', `harness-${realtime ? 'realtime' : 'instant'}-${stamp}`);
  await client.joinRoom({ roomId: 'mock-campfire' });
  const recorder = startRecorder({ client, clock, outDir, label: 'harness' });
  // Measure event-loop stalls during the run: the OS can pause the process for 100 ms or more, and a gap
  // or a stale value is only excused when a measured stall explains it.
  const loop = monitorEventLoopDelay({ resolution: 5 });
  loop.enable();
  await clock.runFor(durationMs);
  loop.disable();
  if (realtime) writeFileSync(join(outDir, 'harness-loop.json'), JSON.stringify({ maxStallMs: Math.round(loop.max / 1e6) }));
  // Stop recording before leaving, or the recorder logs everyone "leaving" as the bot disconnects.
  await recorder.stop();
  await client.leaveRoom();
  return outDir;
}

function readLines(file) {
  return readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean).map((text, i) => ({ line: i + 1, ...JSON.parse(text) }));
}

function comparePoses() {
  const got = readLines('poses.jsonl');
  const want = expectedPoseLines(START, SESSION.durationMs);
  const max = { pos: 0, rot: 0, bone: 0, hip: 0, dt: 0 };
  let matched = 0;
  let missing = 0;
  let extra = 0;
  for (const peer of new Set(want.map((w) => w.peer))) {
    const g = got.filter((x) => x.peer === peer);
    const w = want.filter((x) => x.peer === peer);
    const firstT = g[0]?.t;
    if (!exactTiming) {
      // Real time: timers stall now and then (GC, the OS), so there is no fixed grid. Every line is checked
      // at its own timestamp, and coverage must have no hole longer than two sample periods.
      const period = 1000 / SESSION.poseHz;
      const firstWanted = w.find((x) => x.required)?.t ?? 0;
      if (firstT === undefined || firstT > firstWanted + period) fail('poses.jsonl', `${peer} first sample late (t=${firstT}, wanted by ${Math.round(firstWanted + period)})`);
      for (let i = 1; i < g.length; i++) {
        const gap = g[i].t - g[i - 1].t;
        max.gap = Math.max(max.gap ?? 0, gap);
        if (gap > Math.max(TOL.maxGapPeriods * period, STALL_MS + 2 * period)) { fail(`poses.jsonl:${g[i].line}`, `${peer} ${gap} ms gap before t=${g[i].t}`); missing++; }
      }
      if (g.length && g.at(-1).t < SESSION.durationMs - 2 * period) fail('poses.jsonl', `${peer} stops early at t=${g.at(-1).t}`);
      for (const rec of g) { matched++; checkPose(rec, max, firstT); }
      continue;
    }
    let gi = 0;
    for (const exp of w) {
      // Skip recorded lines that come before this expected sample and match nothing.
      while (gi < g.length && g[gi].t < exp.t) {
        fail(`poses.jsonl:${g[gi].line}`, `${peer} unexpected sample at t=${g[gi].t}`); extra++; gi++;
      }
      const rec = g[gi];
      if (!rec || rec.t !== exp.t) {
        if (exp.required) { fail('poses.jsonl', `${peer} missing sample at t=${exp.t}`); missing++; }
        continue;
      }
      gi++;
      matched++;
      checkPose(rec, max, firstT);
    }
    for (; gi < g.length; gi++) { fail(`poses.jsonl:${g[gi].line}`, `${peer} unexpected sample at t=${g[gi].t}`); extra++; }
  }
  const strays = got.filter((x) => !want.some((w) => w.peer === x.peer));
  for (const s of strays) { fail(`poses.jsonl:${s.line}`, `unknown peer ${s.peer}`); extra++; }
  summary.push(`poses.jsonl   ${got.length} lines: ${matched} matched, ${missing} missing, ${extra} unexpected`);
  summary.push(`              worst error: position ${(max.pos * 1000).toFixed(2)} mm (tol ${TOL.positionM * 1000}), rotation ${max.rot.toFixed(3)}° (tol ${TOL.rotationDeg}), bone ${max.bone.toFixed(3)}° (tol ${TOL.boneDeg}), hip ${(max.hip * 1000).toFixed(2)} mm (tol ${TOL.hipM * 1000})`);
  summary.push(`              oldest value: root ${max.rootAge ?? 0} ms, bones ${max.boneAge ?? 0} ms` + (exactTiming ? '; sample times exact' : `; longest gap ${max.gap ?? 0} ms (tol ${Math.round(Math.max(TOL.maxGapPeriods * 1000 / SESSION.poseHz, STALL_MS + 2000 / SESSION.poseHz))}, worst event-loop stall ${STALL_MS} ms)`) + (max.rootOnly ? `; ${max.rootOnly} position-only line(s) just after a join` : ''));
}

// The best match between a recorded value and the scene anywhere in [t - staleMs, t], at 1 ms steps.
function bestInWindow(t, staleMs, errorAt) {
  let best = { err: Infinity, ageMs: 0 };
  for (let age = 0; age <= staleMs; age++) {
    const err = errorAt(t - age);
    if (err < best.err) best = { err, ageMs: age };
  }
  return best;
}

function checkPose(rec, max, firstT) {
  const where = `poses.jsonl:${rec.line}`;
  const extra = exactTiming ? 0 : Math.max(TOL.realtimeExtraStaleMs, STALL_MS);
  const sceneT = rec.t + START;
  const root = bestInWindow(sceneT,TOL.rootStaleMs + extra, (t) => {
    const truth = truthAt(rec.peer, t).root;
    // Weigh 1 mm of position like 0.5° of rotation, so one window position fits both.
    const pos = Math.hypot(...rec.pos.map((v, i) => v - truth.position[i]));
    const rot = quatAngle(rec.rot, truth.rotation);
    return Math.max(pos / TOL.positionM, rot / TOL.rotationDeg);
  });
  const rootTruth = truthAt(rec.peer, sceneT - root.ageMs).root;
  const pos = Math.hypot(...rec.pos.map((v, i) => v - rootTruth.position[i]));
  const rot = quatAngle(rec.rot, rootTruth.rotation);
  max.pos = Math.max(max.pos, pos);
  max.rot = Math.max(max.rot, rot);
  max.rootAge = Math.max(max.rootAge ?? 0, root.ageMs);
  if (pos > TOL.positionM) fail(where, `${rec.peer} t=${rec.t} position off by ${(pos * 1000).toFixed(1)} mm (best match ${root.ageMs} ms earlier)`);
  if (rot > TOL.rotationDeg) fail(where, `${rec.peer} t=${rec.t} rotation off by ${rot.toFixed(2)}° (best match ${root.ageMs} ms earlier)`);

  const bones = rec.bones && decodeBonePose(Buffer.from(rec.bones, 'base64'));
  if (!bones) {
    // A peer's position can arrive just before its first bone pose; only then is a line allowed without bones.
    if (!rec.bones && rec.t - firstT <= TOL.boneStaleMs + extra) { max.rootOnly = (max.rootOnly ?? 0) + 1; return; }
    fail(where, `${rec.peer} t=${rec.t} bone pose missing or undecodable`);
    return;
  }
  const boneError = (truth, b) => quatAngle(bones.rotations[b], truth.rotations[b]);
  const fit = bestInWindow(sceneT, TOL.boneStaleMs + extra, (t) => {
    const truth = truthAt(rec.peer, t).bones;
    return Math.max(...bones.rotations.map((_, b) => boneError(truth, b)));
  });
  const truth = truthAt(rec.peer, sceneT - fit.ageMs).bones;
  max.boneAge = Math.max(max.boneAge ?? 0, fit.ageMs);
  const hip = Math.hypot(...bones.hipWorldPos.map((v, i) => v - truth.hipWorldPos[i]));
  max.hip = Math.max(max.hip, hip);
  if (hip > TOL.hipM) fail(where, `${rec.peer} t=${rec.t} hip off by ${(hip * 1000).toFixed(1)} mm`);
  bones.rotations.forEach((_, b) => {
    const a = boneError(truth, b);
    max.bone = Math.max(max.bone, a);
    if (a > TOL.boneDeg) fail(where, `${rec.peer} t=${rec.t} ${BONE_NAMES[b]} off by ${a.toFixed(2)}° (best match ${fit.ageMs} ms earlier)`);
  });
}

function compareEvents() {
  const got = readLines('events.jsonl');
  const want = expectedEvents();
  const used = new Set();
  let worst = { start: 0, end: 0, join: 0 };
  for (const exp of want) {
    const candidates = got.filter((g) => !used.has(g.line) && g.type === exp.type && g.peer === exp.peer);
    const timeOf = (g) => START + (g.type === 'speaking_started' ? g.startedMs : g.type === 'speaking_stopped' ? g.endedMs : g.t);
    const best = candidates.sort((a, b) => Math.abs(timeOf(a) - exp.at) - Math.abs(timeOf(b) - exp.at))[0];
    const label = `${exp.peer} ${exp.type}${exp.text ? ` "${exp.text}"` : ''} at ${exp.at} ms`;
    if (!best) { fail('events.jsonl', `missing: ${label}`); continue; }
    const err = timeOf(best) - exp.at;
    const key = exp.type === 'speaking_started' ? 'start' : exp.type === 'speaking_stopped' ? 'end' : 'join';
    const tol = { start: TOL.speechStartMs, end: TOL.speechEndMs, join: TOL.joinMs }[key];
    if (Math.abs(err) > tol) { fail(`events.jsonl:${best.line}`, `${label}: recorded at scene ${timeOf(best).toFixed(0)} ms (${err > 0 ? '+' : ''}${err.toFixed(0)} ms, tol ±${tol})`); continue; }
    used.add(best.line);
    worst[key] = Math.max(worst[key], Math.abs(err));
  }
  for (const g of got) if (!used.has(g.line) && !report.some((r) => r.startsWith(`events.jsonl:${g.line} `))) fail(`events.jsonl:${g.line}`, `unexpected ${g.type} for ${g.peer} at ${g.t} ms`);
  summary.push(`events.jsonl  ${got.length} lines vs ${want.length} expected; worst timing: join ${worst.join.toFixed(0)} ms (tol ${TOL.joinMs}), speech start ${worst.start.toFixed(0)} ms (tol ${TOL.speechStartMs}), speech end ${worst.end.toFixed(0)} ms (tol ${TOL.speechEndMs})`);
}

function compareVoices() {
  const session = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
  for (const peer of [...new Set(expectedPoseLines(START).map((w) => w.peer))]) {
    const file = session.peers[peer]?.voiceFile;
    if (!file) { fail('session.json', `${peer} has no voice file`); continue; }
    const wav = readFileSync(join(dir, file));
    const got = new Int16Array(wav.buffer, wav.byteOffset + 44, wav.readUInt32LE(40) / 2);
    const { pcm: want, joinSample } = expectedVoice(peer, SESSION.durationMs + START + 100);
    // Recorded sample r should be scene sample r + startSamples. Find the actual alignment to the sample
    // on a window of this peer's first speech, then require a sample-exact match over the whole stem.
    const startSamples = Math.round((START / 1000) * VOICE_SAMPLE_RATE);
    const firstSpeech = expectedEvents().find((e) => e.peer === peer && e.type === 'speaking_started');
    const w0 = Math.round((firstSpeech.at / 1000) * VOICE_SAMPLE_RATE);
    const WINDOW = VOICE_SAMPLE_RATE / 10;
    const SEARCH = (VOICE_SAMPLE_RATE * TOL.sampleTimeMs) / 1000;
    let offset = 0;
    let bestSum = Infinity;
    for (let off = -SEARCH; off <= SEARCH; off++) {
      let sum = 0;
      for (let n = w0; n < w0 + WINDOW && sum < bestSum; n++) sum += Math.abs((got[n - startSamples - off] ?? 0) - want[n]);
      if (sum < bestSum) { bestSum = sum; offset = off; }
    }
    const best = { offset, maxDiff: 0, at: 0 };
    const from = Math.max(joinSample + VOICE_SAMPLE_RATE / 50, startSamples + offset);
    for (let n = from; n < Math.min(want.length, got.length + startSamples + offset); n++) {
      const d = Math.abs(got[n - startSamples - offset] - want[n]);
      if (d > best.maxDiff) { best.maxDiff = d; best.at = n; }
    }
    let loudBeforeJoin = 0;
    for (let r = 0; r < Math.max(0, joinSample - startSamples - VOICE_SAMPLE_RATE / 100); r++) loudBeforeJoin = Math.max(loudBeforeJoin, Math.abs(got[r]));
    const offMs = Number(((best.offset / VOICE_SAMPLE_RATE) * 1000).toFixed(2));
    const seconds = got.length / VOICE_SAMPLE_RATE;
    summary.push(`${file.padEnd(14)}${seconds.toFixed(2)} s; alignment ${offMs} ms; max sample difference ${best.maxDiff} LSB (tol ${TOL.voiceLsb}); before join peak ${loudBeforeJoin} LSB`);
    if (best.maxDiff > TOL.voiceLsb) fail(file, `${peer} differs by ${best.maxDiff} LSB at ${((best.at / VOICE_SAMPLE_RATE) * 1000).toFixed(1)} ms`);
    if (exactTiming && best.offset !== 0) fail(file, `${peer} stem shifted by ${offMs} ms`);
    if (Math.abs(offMs) > TOL.sampleTimeMs) fail(file, `${peer} stem shifted by ${offMs} ms (tol ${TOL.sampleTimeMs})`);
    if (loudBeforeJoin > TOL.silenceLsb) fail(file, `${peer} has sound before joining (peak ${loudBeforeJoin} LSB)`);
    if (Math.abs(seconds * 1000 - SCENE_DURATION_MS) > TOL.sampleTimeMs) fail(file, `${peer} stem is ${seconds.toFixed(3)} s`);
  }
}

function compareSession() {
  const s = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
  const want = [...new Set(expectedPoseLines(START).map((w) => w.peer))];
  const got = Object.keys(s.peers);
  for (const p of want) if (!got.includes(p)) fail('session.json', `missing peer ${p}`);
  for (const p of got) if (!want.includes(p)) fail('session.json', `unexpected peer ${p} (${s.peers[p].displayName})`);
  if (Math.abs(s.durationMs - SCENE_DURATION_MS) > TOL.sampleTimeMs) fail('session.json', `duration ${s.durationMs} ms`);
  summary.push(`session.json  ${got.length} peers, ${s.durationMs} ms, ${s.poseSamples} pose samples`);
}

function quatAngle(a, b) {
  const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

// Golden test: record mock scenarios, then compare every output line and sample against the scene's ground truth.
//   npm run harness                                   every scenario, instantly (virtual clock, exact timing)
//   npm run harness -- --scenario mutes               one scenario (see ../mock/scenarios/index.mjs)
//   npm run harness -- --scenario campfire --realtime in real time (timing-tolerant, real timers and stalls)
//   npm run harness -- --compare <dir>                re-check an existing recording
//   npm run harness -- --crash                        kill a real-time recording (SIGKILL) at 6 s, recover it, check what survived
// Each recording folder gets a harness-report.txt listing every mismatch by file and line.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { decodeBonePose, BONE_NAMES } from 'altspace.js';
import { createMockRoomClient } from '../mock/mock-room.mjs';
import { buildScene, VOICE_SAMPLE_RATE } from '../mock/scenario.mjs';
import { scenarios } from '../mock/scenarios/index.mjs';
import { virtualClock, wallClock } from '../../core/clock.mjs';
import { startRecorder } from '../../core/recorder.mjs';
import { recoverRecording } from '../../core/recover.mjs';
import { altspaceSource } from '../adapter.mjs';
import { PRESENCE_GRACE_MS, expectedEvents, expectedPoseLines, expectedVoice, peers, stalenessMs, truthAt } from './expected.mjs';

const TOL = {
  positionM: 0.001, // within the staleness window, only quantization error is allowed
  rotationDeg: 0.5,
  boneDeg: 0.5,
  hipM: 0.001,
  realtimeExtraStaleMs: 25, // real timers run late; real-time runs also add the worst measured stall
  maxGapPeriods: 3, // real time: longest hole between pose samples, in sample periods (plus any measured stall)
  speechMs: 50,
  presenceMs: 40,
  voiceLsb: 1,
  silenceLsb: 16,
  placementMs: 5, // real time: a run of audio may sit this far off (frames arrive late); content must still match exactly
};

const args = process.argv.slice(2);
const opt = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const crash = args.includes('--crash');
const CRASH_AT_MS = 6_000;
const realtime = args.includes('--realtime') || crash;
const compareDir = opt('compare');
const names = compareDir ? [null] : opt('scenario') && opt('scenario') !== 'all' ? opt('scenario').split(',') : crash ? ['campfire'] : Object.keys(scenarios).filter((n) => n !== 'long' || args.includes('--long'));

const results = [];
for (const name of names) results.push(await runOne(name));

console.log('\nScenario      Mode       Result   Lines   Events  Voices  Time');
for (const r of results) console.log(`${r.name.padEnd(14)}${r.mode.padEnd(11)}${(r.failures ? `FAIL ${r.failures}` : 'pass').padEnd(9)}${String(r.lines).padEnd(8)}${String(r.events).padEnd(8)}${String(r.voices).padEnd(8)}${r.seconds}s`);
const failed = results.filter((r) => r.failures);
console.log(failed.length ? `\n${failed.length} scenario(s) failed: ${failed.map((r) => `${r.name} (${r.dir}/harness-report.txt)`).join(', ')}` : '\nEvery scenario matches its scene.');
process.exit(failed.length ? 1 : 0);

async function runOne(name) {
  const started = performance.now();
  const dir = compareDir ?? (crash ? await recordAndCrash(name) : await record(name));
  const session = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8'));
  const scene = buildScene(scenarios[name ?? session.label] ?? scenarios.campfire);
  const ctx = {
    dir, scene, session,
    start: session.startClockMs ?? 0,
    exact: session.clock === 'virtual',
    stall: session.clock === 'virtual' ? 0 : existsSync(join(dir, 'harness-loop.json')) ? JSON.parse(readFileSync(join(dir, 'harness-loop.json'), 'utf8')).maxStallMs : 100,
    report: [], summary: [], failures: 0,
    crashed: session.status === 'recovered',
  };
  // After a crash, the last moments may not have reached disk (unflushed lines, ~300 ms of voice look-ahead).
  ctx.checkedUntil = ctx.crashed ? session.durationMs - 800 : Infinity;
  ctx.fail = (where, msg) => { ctx.failures++; ctx.report.push(`${where}  ${msg}`); };

  if (session.status !== (crash || ctx.crashed ? 'recovered' : 'complete')) ctx.fail('session.json', `status is "${session.status}", expected "${crash ? 'recovered' : 'complete'}"`);
  const lines = comparePoses(ctx);
  const events = compareEvents(ctx);
  const voices = compareVoices(ctx);
  compareSession(ctx);

  const header = `Harness ${dir}  scenario ${scene.name}  (${ctx.exact ? 'instant: exact timing' : `real time: timing tolerant, worst stall ${ctx.stall} ms`})`;
  writeFileSync(join(dir, 'harness-report.txt'), [header, scene.description, '', ...ctx.summary, '', ctx.failures ? `${ctx.failures} mismatches:` : 'No mismatches.', ...ctx.report].join('\n') + '\n');
  console.log(`\n${header}\n  ${scene.description}`);
  for (const s of ctx.summary) console.log(`  ${s}`);
  if (ctx.failures) for (const r of ctx.report.slice(0, 12)) console.log(`  ✗ ${r}`);
  return { name: scene.name, mode: ctx.crashed ? 'crashed' : ctx.exact ? 'instant' : 'real time', failures: ctx.failures, lines, events, voices, dir, seconds: ((performance.now() - started) / 1000).toFixed(1) };
}

async function record(name) {
  const scene = buildScene(scenarios[name]);
  const clock = realtime ? wallClock() : virtualClock({ stalls: scene.faults.clockStalls });
  const { client, durationMs } = createMockRoomClient({ clock, scene, displayName: 'Recorder' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = join('recordings', `harness-${name}-${realtime ? 'realtime' : 'instant'}-${stamp}`);
  await client.joinRoom({});
  const recorder = startRecorder({ source: altspaceSource(client), clock, outDir, label: name });
  // In real time, stall the process for real (a busy wait blocks every timer), as GC or the OS would.
  const stallTimers = realtime ? scene.faults.clockStalls.map((s) => setTimeout(() => { const end = performance.now() + s.durationMs; while (performance.now() < end); }, s.atMs)) : [];
  const loop = monitorEventLoopDelay({ resolution: 5 });
  loop.enable();
  await clock.runFor(durationMs);
  loop.disable();
  stallTimers.forEach(clearTimeout);
  // Stop recording before leaving, or the recorder logs everyone "leaving" as the bot disconnects.
  await recorder.stop();
  await client.leaveRoom();
  if (realtime) writeFileSync(join(outDir, 'harness-loop.json'), JSON.stringify({ maxStallMs: Math.round(loop.max / 1e6) }));
  return outDir;
}

async function recordAndCrash(name) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = join('recordings', `harness-${name}-crash-${stamp}`);
  const child = fork(fileURLToPath(new URL('./crash-child.mjs', import.meta.url)), [name, outDir], { stdio: 'inherit' });
  await new Promise((resolve) => child.once('message', resolve));
  await new Promise((resolve) => setTimeout(resolve, CRASH_AT_MS));
  child.kill('SIGKILL');
  await new Promise((resolve) => child.once('exit', resolve));
  const { session, repaired } = recoverRecording(outDir);
  console.log(`\nKilled the recorder at ~${CRASH_AT_MS / 1000} s; recovery kept ${(session.durationMs / 1000).toFixed(2)} s. ${repaired.join('; ')}`);
  return outDir;
}

function readLines(ctx, file) {
  return readFileSync(join(ctx.dir, file), 'utf8').split('\n').filter(Boolean).map((text, i) => ({ line: i + 1, ...JSON.parse(text) }));
}

function comparePoses(ctx) {
  const { scene, session, exact } = ctx;
  const got = readLines(ctx, 'poses.jsonl');
  const want = expectedPoseLines(scene, ctx.start, session.durationMs);
  const max = { pos: 0, rot: 0, bone: 0, hip: 0, gap: 0, rootOnly: 0 };
  const period = 1000 / session.poseHz;
  let matched = 0, missing = 0, extra = 0;
  for (const p of peers(scene)) {
    const g = got.filter((x) => x.peer === p.peerId);
    const w = want.filter((x) => x.peer === p.peerId);
    if (exact) {
      // Instant mode: the sample schedule is deterministic, so lines must match the expected ones one for one.
      const byT = new Map(g.map((x) => [x.t, x]));
      for (const exp of w) {
        const rec = byT.get(exp.t);
        if (!rec) { if (exp.required) { ctx.fail('poses.jsonl', `${p.peerId} missing sample at t=${exp.t}`); missing++; } continue; }
        byT.delete(exp.t);
        matched++;
        checkPose(ctx, rec, exp, max);
      }
      for (const rec of byT.values()) { ctx.fail(`poses.jsonl:${rec.line}`, `${p.peerId} unexpected sample at t=${rec.t}`); extra++; }
    } else {
      // Real time: no fixed grid. Every line is checked at its own time; coverage may have no unexplained holes.
      for (let i = 1; i < g.length; i++) {
        const gap = g[i].t - g[i - 1].t;
        // Only a hole the peer was clearly present for counts: not the detection delay right after a (re)join.
        const late = period + 25 + ctx.stall;
        const away = !w.some((e) => e.required && e.t > g[i - 1].t && e.t < g[i].t - late) ? 0 : 1;
        max.gap = Math.max(max.gap, gap * away);
        if (away && gap > Math.max(TOL.maxGapPeriods * period, ctx.stall + 2 * period)) { ctx.fail(`poses.jsonl:${g[i].line}`, `${p.peerId} ${gap} ms gap before t=${g[i].t}`); missing++; }
      }
      for (const rec of g) {
        const T = rec.t + ctx.start;
        const inSession = p.sessions.some((s) => T >= s.joinMs - ctx.stall && T < s.leaveMs + PRESENCE_GRACE_MS + ctx.stall + 25);
        if (!inSession) { ctx.fail(`poses.jsonl:${rec.line}`, `${p.peerId} sample at t=${rec.t} while not in the room`); extra++; continue; }
        matched++;
        checkPose(ctx, rec, { bones: scene.hasBonesAt(p.c, T) }, max);
      }
    }
  }
  const known = new Set(peers(scene).map((p) => p.peerId));
  for (const s of got.filter((x) => !known.has(x.peer))) { ctx.fail(`poses.jsonl:${s.line}`, `unknown peer ${s.peer}`); extra++; }
  ctx.summary.push(`poses.jsonl   ${got.length} lines: ${matched} matched, ${missing} missing, ${extra} unexpected`);
  ctx.summary.push(`              worst error: position ${(max.pos * 1000).toFixed(2)} mm, rotation ${max.rot.toFixed(3)}°, bone ${max.bone.toFixed(3)}°, hip ${(max.hip * 1000).toFixed(2)} mm` +
    (exact ? '' : `; longest gap ${max.gap} ms`) + (max.rootOnly ? `; ${max.rootOnly} line(s) legitimately without bones` : ''));
  return got.length;
}

// Search back from T for the moment the scene matches the recorded value (it's the latest published one).
function bestInWindow(T, windowMs, errorAt) {
  let best = { err: Infinity, ageMs: 0 };
  for (let age = 0; age <= windowMs; age += 0.25) { // quarter-ms steps: at 500°/s a whole ms is 0.5°
    const err = errorAt(T - age);
    if (err < best.err) best = { err, ageMs: age };
    if (err <= 0.1) break; // a near-exact match (a tenth of tolerance): stop, keeping long scenarios fast
  }
  return best;
}

function checkPose(ctx, rec, exp, max) {
  const { scene } = ctx;
  const where = `poses.jsonl:${rec.line}`;
  const T = rec.t + ctx.start;
  const extra = ctx.exact ? 0 : TOL.realtimeExtraStaleMs + ctx.stall;
  const root = bestInWindow(T, stalenessMs(scene, rec.peer, T, 'root') + extra, (t) => {
    const truth = truthAt(scene, rec.peer, t).root;
    const pos = Math.hypot(...rec.pos.map((v, i) => v - truth.position[i]));
    return Math.max(pos / TOL.positionM, quatAngle(rec.rot, truth.rotation) / TOL.rotationDeg);
  });
  const rt = truthAt(scene, rec.peer, T - root.ageMs).root;
  const pos = Math.hypot(...rec.pos.map((v, i) => v - rt.position[i]));
  const rot = quatAngle(rec.rot, rt.rotation);
  max.pos = Math.max(max.pos, pos); max.rot = Math.max(max.rot, rot);
  if (pos > TOL.positionM) ctx.fail(where, `${rec.peer} t=${rec.t} position off by ${(pos * 1000).toFixed(1)} mm`);
  if (rot > TOL.rotationDeg) ctx.fail(where, `${rec.peer} t=${rec.t} rotation off by ${rot.toFixed(2)}°`);

  const boneWindow = stalenessMs(scene, rec.peer, T, 'bones') + extra;
  if (!rec.bones) {
    // Fine if the scene has no bones for this peer around now (never sent, or not yet).
    if (!exp.bones || !scene.hasBonesAt(peers(scene).find((p) => p.peerId === rec.peer).c, T - boneWindow) || isJustJoined(ctx, rec.peer, T, boneWindow)) { max.rootOnly++; return; }
    ctx.fail(where, `${rec.peer} t=${rec.t} bone pose missing`);
    return;
  }
  const bones = decodeBonePose(Buffer.from(rec.bones, 'base64'));
  if (!bones) { ctx.fail(where, `${rec.peer} t=${rec.t} bone pose undecodable`); return; }
  if (!exp.bones && !scene.hasBonesAt(peers(scene).find((p) => p.peerId === rec.peer).c, T - boneWindow)) { ctx.fail(where, `${rec.peer} t=${rec.t} has bones the scene never sent`); return; }
  const fit = bestInWindow(T, boneWindow, (t) => {
    const truth = truthAt(scene, rec.peer, t).bones;
    return Math.max(...bones.rotations.map((q, b) => quatAngle(q, truth.rotations[b]))) / TOL.boneDeg;
  });
  const truth = truthAt(scene, rec.peer, T - fit.ageMs).bones;
  const hip = Math.hypot(...bones.hipWorldPos.map((v, i) => v - truth.hipWorldPos[i]));
  max.hip = Math.max(max.hip, hip);
  if (hip > TOL.hipM) ctx.fail(where, `${rec.peer} t=${rec.t} hip off by ${(hip * 1000).toFixed(1)} mm`);
  bones.rotations.forEach((q, b) => {
    const a = quatAngle(q, truth.rotations[b]);
    max.bone = Math.max(max.bone, a);
    if (a > TOL.boneDeg) ctx.fail(where, `${rec.peer} t=${rec.t} ${BONE_NAMES[b]} off by ${a.toFixed(2)}°`);
  });
}

function isJustJoined(ctx, peerId, T, windowMs) {
  return peers(ctx.scene).find((p) => p.peerId === peerId).sessions.some((s) => T >= s.joinMs && T < s.joinMs + windowMs + PRESENCE_GRACE_MS);
}

function compareEvents(ctx) {
  const got = readLines(ctx, 'events.jsonl');
  const want = expectedEvents(ctx.scene);
  const used = new Set();
  const worst = { presence: 0, speech: 0 };
  const timeOf = (g) => ctx.start + (g.type === 'speaking_started' ? g.startedMs : g.type === 'speaking_stopped' ? g.endedMs : g.t);
  const stallAround = (t) => ctx.scene.faults.clockStalls.filter((s) => t >= s.atMs - 20 && t <= s.atMs + s.durationMs + 20).reduce((m, s) => Math.max(m, s.durationMs), 0);
  for (const exp of want.filter((e) => e.at < ctx.checkedUntil)) {
    const best = got.filter((g) => !used.has(g.line) && g.type === exp.type && g.peer === exp.peer)
      .sort((a, b) => Math.abs(timeOf(a) - exp.at) - Math.abs(timeOf(b) - exp.at))[0];
    const label = `${exp.peer} ${exp.type}${exp.text ? ` "${exp.text}"` : ''} at ${Math.round(exp.at)} ms`;
    if (!best) { ctx.fail('events.jsonl', `missing: ${label}`); continue; }
    const err = timeOf(best) - exp.at;
    const speech = exp.type.startsWith('speaking');
    const tol = (speech ? TOL.speechMs : TOL.presenceMs + stallAround(exp.at)) + (ctx.exact ? 0 : 10 + ctx.stall);
    if (Math.abs(err) > tol) { ctx.fail(`events.jsonl:${best.line}`, `${label}: recorded at ${Math.round(timeOf(best))} ms (${err > 0 ? '+' : ''}${Math.round(err)} ms, tol ±${tol})`); continue; }
    used.add(best.line);
    worst[speech ? 'speech' : 'presence'] = Math.max(worst[speech ? 'speech' : 'presence'], Math.abs(err));
  }
  for (const g of got) if (!used.has(g.line) && timeOf(g) < ctx.checkedUntil && !ctx.report.some((r) => r.startsWith(`events.jsonl:${g.line} `))) ctx.fail(`events.jsonl:${g.line}`, `unexpected ${g.type} for ${g.peer} at ${g.t} ms`);
  ctx.summary.push(`events.jsonl  ${got.length} lines vs ${want.length} expected; worst timing: presence ${Math.round(worst.presence)} ms, speech ${Math.round(worst.speech)} ms`);
  return got.length;
}

function compareVoices(ctx) {
  const { scene, session } = ctx;
  let n = 0;
  for (const p of peers(scene)) {
    const file = session.peers[p.peerId]?.voiceFile;
    const { pcm: want, mask, frame } = expectedVoice(scene, p.peerId, session.durationMs + ctx.start + 50);
    const expectsVoice = mask.includes('voice');
    if (!file) { if (expectsVoice) ctx.fail('session.json', `${p.peerId} has no voice file`); continue; }
    n++;
    const wav = readFileSync(join(ctx.dir, file));
    if (wav.readUInt32LE(40) !== wav.length - 44) ctx.fail(file, `WAV header says ${wav.readUInt32LE(40)} data bytes, file has ${wav.length - 44}`);
    const got = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.length - 44) / 2);
    const startSamples = Math.round((ctx.start / 1000) * VOICE_SAMPLE_RATE);
    const at = (n) => got[n - startSamples] ?? 0; // scene sample n, read from the recording
    let worstVoice = 0, worstSilence = 0, worstOffset = 0, badFrames = 0, firstBad = -1;
    // Instant mode: placement must be exact (offset 0). Real time: frames arrive a little late, so each run of
    // audio may sit up to SEARCH samples off; the offset is tracked frame to frame (re-searched when a run
    // changes) and the content must still match sample for sample at it.
    const SEARCH = ctx.exact ? 0 : (VOICE_SAMPLE_RATE * TOL.placementMs) / 1000;
    let off = 0;
    const diffAt = (a, b, o) => { let d = 0; for (let i = a; i < b && d <= TOL.voiceLsb; i++) d = Math.max(d, Math.abs(at(i + o) - want[i])); return d; };
    const peakAt = (a, b, o) => { let pk = 0; for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(at(i + o))); return pk; };
    const bad = (f) => { badFrames++; if (firstBad < 0) firstBad = f; };
    for (let f = 0; f < mask.length; f++) {
      if (mask[f] === 'edge') continue;
      const a = f * frame, b = a + frame;
      if ((a - startSamples) < 0 || (b - startSamples) / VOICE_SAMPLE_RATE * 1000 > session.durationMs) continue; // outside the recording
      if (a / VOICE_SAMPLE_RATE * 1000 > ctx.checkedUntil) continue; // past what a crash can be expected to keep
      // In real time the last frame or two may not have been delivered yet when recording stopped.
      if (!ctx.exact && b - startSamples + SEARCH > got.length && (a - startSamples) / VOICE_SAMPLE_RATE * 1000 > session.durationMs - 20) continue;
      if (mask[f] === 'silent') {
        let peak = peakAt(a, b, off);
        for (let o = -SEARCH; peak > TOL.silenceLsb && o <= SEARCH; o++) peak = Math.min(peak, peakAt(a, b, o));
        worstSilence = Math.max(worstSilence, peak);
        if (peak > TOL.silenceLsb) bad(f);
        continue;
      }
      let d = diffAt(a, b, off);
      if (d > TOL.voiceLsb) {
        for (let k = 1; k <= SEARCH && d > TOL.voiceLsb; k++) {
          for (const o of [off + k, off - k]) {
            if (Math.abs(o) > SEARCH) continue;
            const e = diffAt(a, b, o);
            if (e <= TOL.voiceLsb) { d = e; off = o; break; }
          }
        }
      }
      worstVoice = Math.max(worstVoice, d);
      worstOffset = Math.max(worstOffset, Math.abs(off));
      if (d > TOL.voiceLsb) bad(f);
    }
    ctx.summary.push(`${file.padEnd(22)}${(got.length / VOICE_SAMPLE_RATE).toFixed(2)} s, ${session.voiceRuns?.[p.peerId] ?? '?'} run(s); ` +
      `worst sample difference ${worstVoice} LSB` + (ctx.exact ? '' : ` at placement within ${(worstOffset / VOICE_SAMPLE_RATE * 1000).toFixed(2)} ms`) + `; worst leak into silence ${worstSilence} LSB`);
    if (badFrames) ctx.fail(file, `${p.peerId}: ${badFrames} of ${mask.length} 10 ms frames wrong, first at ${firstBad * 10} ms (${mask[firstBad]})`);
  }
  return n;
}

function compareSession(ctx) {
  const { scene, session } = ctx;
  const want = peers(scene).map((p) => p.peerId);
  const got = Object.keys(session.peers);
  for (const p of want) if (!got.includes(p)) ctx.fail('session.json', `missing peer ${p}`);
  for (const p of got) if (!want.includes(p)) ctx.fail('session.json', `unexpected peer ${p} (${session.peers[p].displayName})`);
  for (const p of peers(scene)) {
    const rec = session.peers[p.peerId];
    if (!rec) continue;
    if (rec.displayName !== p.c.displayName) ctx.fail('session.json', `${p.peerId} name "${rec.displayName}", expected "${p.c.displayName}"`);
    if (!ctx.crashed && rec.sessions?.length !== p.sessions.length) ctx.fail('session.json', `${p.peerId} has ${rec.sessions?.length} session(s), expected ${p.sessions.length}`);
  }
  if (!ctx.crashed && Math.abs(session.durationMs - scene.durationMs) > (ctx.exact ? 0 : 50)) ctx.fail('session.json', `duration ${session.durationMs} ms, expected ${scene.durationMs}`);
  const bytes = ['poses.jsonl', 'events.jsonl', ...got.map((p) => session.peers[p].voiceFile).filter(Boolean)].reduce((n, f) => n + statSync(join(ctx.dir, f)).size, 0);
  ctx.summary.push(`session.json  ${got.length} peers, ${session.durationMs} ms, ${session.poseSamples} pose samples, ${session.voiceFrames} voice frames, ${(bytes / 1e6).toFixed(1)} MB on disk`);
}

function quatAngle(a, b) {
  const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

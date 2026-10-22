// Record a room to recordings/<name>/.
//   npm run record:mock -- [--scenario crowd]  a scripted mock scene (default campfire), instantly, no network
//   npm run record:mock -- --realtime           the same scene in real time (10 s of wall clock)
//   npm run record -- <world> [--seconds 30]    a live Altspace world, as a guest recorder bot (--seconds 0: until Ctrl-C)
import { join } from 'node:path';
import { startRecorder } from '../core/recorder.mjs';
import { virtualClock, wallClock } from '../core/clock.mjs';
import { altspaceSource } from './adapter.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

if (flag('mock')) {
  const { createMockRoomClient } = await import('./mock/mock-room.mjs');
  const { buildScene } = await import('./mock/scenario.mjs');
  const { scenarios } = await import('./mock/scenarios/index.mjs');
  const name = option('scenario', 'campfire');
  if (!scenarios[name]) { console.error(`Unknown scenario ${name}. Try: ${Object.keys(scenarios).join(', ')}`); process.exit(1); }
  const scene = buildScene(scenarios[name]);
  const clock = flag('realtime') ? wallClock() : virtualClock({ stalls: scene.faults.clockStalls });
  const { client, durationMs } = createMockRoomClient({ clock, scene, displayName: 'Recorder' });
  const outDir = option('out', join('recordings', `mock-${name}-${stamp}`));
  await client.joinRoom({ roomId: `mock-${name}` });
  const recorder = startRecorder({ source: altspaceSource(client), clock, outDir, label: name });
  await clock.runFor(durationMs);
  // Stop recording before leaving, or the recorder logs everyone "leaving" as the bot disconnects.
  const session = await recorder.stop();
  await client.leaveRoom();
  report(session, outDir);
} else {
  const target = args.find((a) => !a.startsWith('--') && a !== option('seconds'));
  if (!target) {
    console.error('Usage: npm run record -- <world slug> [--seconds 30]   or   npm run record:mock');
    process.exit(1);
  }
  const { bonePoseCodec, BONE_POSE_CODEC_ID, classifyJoinFailure, createRoomClient, describeJoinFailure, guardTransformTick, hardLeave, resolveWorld } = await import('altspace.js');
  const seconds = Number(option('seconds', 30));
  const clock = wallClock();
  const { client, probe, altspace } = await createRoomClient({ clientId: process.env.ALTSPACE_CLIENT_ID, displayName: 'Recorder (test)' });
  guardTransformTick(client, (error) => console.warn('transform tick failed:', error));
  // Without the codec registered, bone-pose extensions from other peers aren't decoded.
  if (!client.transforms.extensions.get(BONE_POSE_CODEC_ID)) client.transforms.extensions.register(bonePoseCodec);
  let recorder;
  // Ctrl-C: finish the recording properly (headers, session.json), then leave.
  process.once('SIGINT', async () => {
    console.log('\nStopping…');
    if (recorder) report(await recorder.stop(), recorder.outDir);
    await hardLeave(client, { timeoutMs: 3000 });
    altspace.dispose();
    process.exit(0);
  });
  let world;
  try {
    world = await resolveWorld(target, { worldsDomain: altspace.config.worldsDomain, getBySlug: (slug) => altspace.worlds.getBySlug(slug) });
    if ('error' in world) throw new Error(world.error);
    await client.joinRoom({ roomId: world.roomId, requestedInstance: world.instance });
  } catch (error) {
    const failure = classifyJoinFailure(error, probe);
    console.error(`Join failed (${failure.kind}: ${failure.reason}). ${describeJoinFailure(failure)}`);
    await hardLeave(client);
    altspace.dispose();
    process.exit(1);
  }
  const outDir = option('out', join('recordings', `${world.slug ?? 'world'}-${stamp}`));
  recorder = startRecorder({ source: altspaceSource(client), clock, outDir, label: world.slug ?? world.roomId });
  recorder.outDir = outDir;
  if (seconds > 0) {
    console.log(`Recording ${world.slug ?? world.roomId} for ${seconds}s (Ctrl-C stops early)…`);
    await clock.runFor(seconds * 1000);
    report(await recorder.stop(), outDir);
    await hardLeave(client);
    altspace.dispose();
  } else {
    console.log(`Recording ${world.slug ?? world.roomId} until Ctrl-C…`);
    await new Promise(() => {}); // the SIGINT handler finishes up
  }
}
// Exit explicitly: letting Node tear down @roamhq/wrtc on its own crashes in its finalizers.
process.exit(0);

function report(session, outDir) {
  console.log(`Recorded ${(session.durationMs / 1000).toFixed(1)}s, ${Object.keys(session.peers).length} peers, ${session.poseSamples} pose samples → ${outDir}`);
}

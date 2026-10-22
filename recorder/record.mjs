// Record a room to recordings/<name>/.
//   npm run record:mock                         the scripted 10 s campfire scene, instantly, no network
//   npm run record:mock -- --realtime           the same scene in real time (10 s of wall clock)
//   npm run record -- <world> [--seconds 30]    a live Altspace world, as a guest recorder bot
import { join } from 'node:path';
import { startRecorder } from './recorder.mjs';
import { virtualClock, wallClock } from '../mock/clock.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

if (flag('mock')) {
  const { createMockRoomClient } = await import('../mock/mock-room.mjs');
  const clock = flag('realtime') ? wallClock() : virtualClock();
  const { client, durationMs } = createMockRoomClient({ clock, displayName: 'Recorder' });
  const outDir = option('out', join('recordings', `mock-campfire-${stamp}`));
  await client.joinRoom({ roomId: 'mock-campfire' });
  const recorder = startRecorder({ client, clock, outDir, label: 'mock campfire scene' });
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
  process.once('SIGINT', async () => { await hardLeave(client, { timeoutMs: 3000 }); process.exit(0); });
  try {
    const world = await resolveWorld(target, { worldsDomain: altspace.config.worldsDomain, getBySlug: (slug) => altspace.worlds.getBySlug(slug) });
    if ('error' in world) throw new Error(world.error);
    await client.joinRoom({ roomId: world.roomId, requestedInstance: world.instance });
    const outDir = option('out', join('recordings', `${world.slug ?? 'world'}-${stamp}`));
    const recorder = startRecorder({ client, clock, outDir, label: world.slug ?? world.roomId });
    console.log(`Recording ${world.slug ?? world.roomId} for ${seconds}s…`);
    await clock.runFor(seconds * 1000);
    report(await recorder.stop(), outDir);
  } catch (error) {
    const failure = classifyJoinFailure(error, probe);
    console.error(`Join failed (${failure.kind}: ${failure.reason}). ${describeJoinFailure(failure)}`);
  } finally {
    await hardLeave(client);
    altspace.dispose();
  }
}
// Exit explicitly: letting Node tear down @roamhq/wrtc on its own crashes in its finalizers.
process.exit(0);

function report(session, outDir) {
  console.log(`Recorded ${(session.durationMs / 1000).toFixed(1)}s, ${Object.keys(session.peers).length} peers, ${session.poseSamples} pose samples → ${outDir}`);
}

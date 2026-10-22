// Joins a world as a guest, logs who comes and goes for a minute, then leaves.
// Usage: npm run hello -- <world slug, URL or invite link>
import {
  classifyJoinFailure,
  createRoomClient,
  describeJoinFailure,
  guardTransformTick,
  hardLeave,
  resolveWorld,
} from 'altspace.js';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npm run hello -- <world slug, URL or invite link>');
  process.exit(1);
}

const { client, probe, altspace } = await createRoomClient({
  clientId: process.env.ALTSPACE_CLIENT_ID,
  displayName: 'Academy Scout',
});
guardTransformTick(client, (error) => console.warn('transform tick failed:', error));

const world = await resolveWorld(target, {
  worldsDomain: altspace.config.worldsDomain,
  getBySlug: (slug) => altspace.worlds.getBySlug(slug),
});
if ('error' in world) throw new Error(world.error);
for (const warning of world.warnings) console.warn(warning);

process.once('SIGINT', async () => {
  await hardLeave(client, { timeoutMs: 3000 });
  process.exit(0);
});

client.on('peerJoined', (peer) => console.log(`${peer.displayName ?? peer.peerId} joined`));
client.on('peerLeft', (peer) => console.log(`${peer.displayName ?? peer.peerId} left`));

try {
  const joined = await client.joinRoom({ roomId: world.roomId, requestedInstance: world.instance });
  console.log(`In ${world.slug ?? world.roomId} (instance ${joined.assignedInstance ?? 'default'}) with ${client.getPeers().length} others`);
  await new Promise((resolve) => setTimeout(resolve, 60_000));
} catch (error) {
  const failure = classifyJoinFailure(error, probe);
  console.error(`Join failed (${failure.kind}: ${failure.reason}). ${describeJoinFailure(failure)}`);
} finally {
  await hardLeave(client);
  altspace.dispose();
}
// Exit explicitly: letting Node tear down @roamhq/wrtc on its own crashes in its finalizers.
process.exit(0);

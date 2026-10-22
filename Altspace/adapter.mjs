// Altspace plugin: turns an altspace.js room client (live, or the mock in ./mock/) into a core recording source.
// See ../core/source.mjs for the contract.
import { BONE_POSE_CODEC_ID, BONE_POSE_CODEC_VERSION } from 'altspace.js';

export function altspaceSource(client) {
  const sessions = new Map(); // peer id -> roomSessionId, which is what transforms are keyed by
  const toPeer = (p) => {
    if (p.roomSessionId) sessions.set(p.peerId, p.roomSessionId);
    return { id: p.peerId, displayName: p.displayName, userId: p.userId, profile: p.userState, isLocal: !!p.isLocal };
  };

  return {
    platform: 'altspace',
    boneCodec: `altspace.bonepose.v${BONE_POSE_CODEC_VERSION}`,
    peers: () => client.getPeers().map(toPeer),
    on(event, fn) {
      if (event !== 'peerJoined' && event !== 'peerLeft') throw new RangeError(`altspaceSource: unknown event ${event}`);
      return client.on(event, (p) => fn(toPeer(p)));
    },
    samplePose(id) {
      const roomSessionId = sessions.get(id) ?? client.getPeer?.(id)?.roomSessionId;
      if (!roomSessionId) return undefined;
      const view = client.transforms.view({ kind: 'participant', roomSessionId, transformKey: 'root' });
      const pose = view?.sample(Number.MAX_SAFE_INTEGER, 0);
      if (!pose) return undefined;
      return { position: pose.position, rotation: pose.rotation, bones: view.extension?.(BONE_POSE_CODEC_ID) };
    },
    onVoiceFrame: (fn) => client.voice.onRemotePcmFrame(fn),
  };
}

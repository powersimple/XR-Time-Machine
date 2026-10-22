// The contract between the core recorder and a platform plugin.
//
// A platform plugin (Altspace/, and later others) turns its own room API into a source:
//
//   source.platform          string     e.g. 'altspace'
//   source.boneCodec         string?    names the encoding of `bones` bytes, e.g. 'altspace.bonepose.v2'
//   source.peers()           Peer[]     everyone currently present, the recording client included (isLocal)
//   source.on(event, fn)     () => void 'peerJoined' | 'peerLeft', called with a Peer; returns an unsubscribe
//   source.samplePose(id)    Pose?      the latest pose received for a peer, or undefined if none yet
//   source.onVoiceFrame(fn)  () => void fn({ peerId, samples: Float32Array, sampleRate, channels }); returns an unsubscribe
//
//   Peer = { id, displayName, userId?, profile?, isLocal }    profile: platform avatar/appearance data, stored as-is
//   Pose = { position: [x, y, z], rotation: [x, y, z, w], bones?: Uint8Array }
//
// Coordinates are Unity-style world space: metres, y up, left-handed; rotations are quaternions [x, y, z, w].

const REQUIRED = ['peers', 'on', 'samplePose', 'onVoiceFrame'];

export function assertSource(source) {
  const missing = REQUIRED.filter((name) => typeof source?.[name] !== 'function');
  if (missing.length || typeof source?.platform !== 'string') {
    throw new TypeError(`Not a recording source: missing ${[...missing, ...(typeof source?.platform === 'string' ? [] : ['platform'])].join(', ')}. See core/source.mjs.`);
  }
}

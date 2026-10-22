// Altspace plugin: the bone codec the studio uses to turn recorded Altspace bone poses into skeletons.
// Joint positions come back in the avatar's local space (root at the origin, metres, y up, facing +z).
import { BONE_INDEX, BONE_POSE_CODEC_VERSION, decodeBonePose, forwardKinematics, loadRig } from 'altspace.js';

const rig = loadRig('human');

export const altspaceBoneCodec = {
  name: `altspace.bonepose.v${BONE_POSE_CODEC_VERSION}`,
  parents: rig.bones.map((b) => b.parent),
  joints(bytes) {
    const pose = decodeBonePose(bytes);
    return pose ? forwardKinematics(rig, pose).positions : null;
  },
  head: BONE_INDEX.Head,
  neck: BONE_INDEX.Neck,
  hips: BONE_INDEX.Hips,
  leftHand: BONE_INDEX.LeftHand,
  rightHand: BONE_INDEX.RightHand,
  // Finger bones add nothing at video distances; skip them when drawing.
  drawn: rig.bones.map((b, i) => i).filter((i) => i < BONE_INDEX.LeftThumbProximal),
};

export const codecs = { [altspaceBoneCodec.name]: altspaceBoneCodec };

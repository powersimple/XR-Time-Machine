// A stand-in for an altspace.js room client that plays the scripted scene in ./scene.mjs.
// It implements the parts of the RoomClient API a recorder uses, with the same shapes:
//   on(event, fn) -> off, joinRoom(), getPeers(), getPeer(), transforms.view(target).sample()/.extension(),
//   voice.onRemotePcmFrame(), leaveRoom(), disconnect()  (so altspace.js's own hardLeave() works on it)
// Time comes from a clock (see ./clock.mjs): virtual for instant runs, or wall-clock for real-time playback.
import { BONE_POSE_CODEC_ID, encodeBonePose, guestAvatarTriple } from 'altspace.js';
import {
  CHARACTERS, SCENE_DURATION_MS, VOICE_SAMPLE_RATE, bonePoseAt, isPresent, rootAt, voiceFrame,
} from './scene.mjs';

const TRANSFORM_HZ = 60;
const BONE_POSE_HZ = 30;
const FRAME_MS = 10;
const FRAME_SAMPLES = (VOICE_SAMPLE_RATE * FRAME_MS) / 1000;

export function createMockRoomClient({ clock, displayName = 'Mock bot' }) {
  const listeners = new Map();
  const pcmHandlers = new Set();
  const stops = [];
  const peers = new Map();
  const latest = new Map(); // roomSessionId -> { pose, bones }
  let joined = false;

  const local = { peerId: 'p-local', roomSessionId: 'rs-local', displayName, isLocal: true };

  function emit(event, value) {
    for (const fn of listeners.get(event) ?? []) {
      try { fn(value); } catch (error) { console.warn(`mock ${event} listener threw:`, error); }
    }
  }

  function peerView(c) {
    const triple = guestAvatarTriple();
    return {
      peerId: `p-${c.id}`, roomSessionId: `rs-${c.id}`, userId: c.userId, displayName: c.displayName, isLocal: false,
      userState: { ...triple, avatarImage: '', muted: '0', cam: '', handRaise: '' },
    };
  }

  function tick() {
    const t = clock.now();
    for (const c of CHARACTERS) {
      if (!peers.has(c.id) && isPresent(c, t)) {
        const p = peerView(c);
        peers.set(c.id, p);
        emit('peerJoined', p);
      }
    }
    for (const [id, p] of peers) {
      const c = CHARACTERS.find((x) => x.id === id);
      const entry = latest.get(p.roomSessionId) ?? {};
      entry.pose = rootAt(c, t);
      latest.set(p.roomSessionId, entry);
    }
  }

  function boneTick() {
    const t = clock.now();
    for (const [id, p] of peers) {
      const c = CHARACTERS.find((x) => x.id === id);
      latest.get(p.roomSessionId).bones = encodeBonePose(bonePoseAt(c, t));
    }
  }

  let voiceSample = 0;
  // Timers run late, so deliver every frame that is due by now: audio keeps real-time pace on average,
  // arriving in small bursts the way it does from a real room.
  function voiceTick() {
    while (((voiceSample + FRAME_SAMPLES) / VOICE_SAMPLE_RATE) * 1000 <= clock.now()) emitVoiceFrame();
  }

  function emitVoiceFrame() {
    const start = voiceSample;
    voiceSample += FRAME_SAMPLES;
    if (!pcmHandlers.size) return;
    for (const [id, p] of peers) {
      const c = CHARACTERS.find((x) => x.id === id);
      const frame = { samples: voiceFrame(c, start, FRAME_SAMPLES), sampleRate: VOICE_SAMPLE_RATE, channels: 1, peerId: p.peerId, producerId: `mic-${id}` };
      for (const fn of pcmHandlers) {
        try { fn(frame); } catch { /* the real client swallows handler errors too */ }
      }
    }
  }

  const client = {
    isMock: true,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    async joinRoom({ roomId = 'mock-campfire', requestedInstance } = {}) {
      joined = true;
      stops.push(clock.every(1000 / TRANSFORM_HZ, tick), clock.every(1000 / BONE_POSE_HZ, boneTick), clock.every(FRAME_MS, voiceTick));
      tick();
      boneTick();
      const result = { roomId, assignedInstance: requestedInstance ?? 'mock' };
      emit('roomJoined', result);
      return result;
    },
    getPeers() {
      return [local, ...peers.values()];
    },
    getPeer(peerId) {
      return this.getPeers().find((p) => p.peerId === peerId);
    },
    transforms: {
      extensions: { register() {}, get: () => true },
      view(target) {
        if (target?.kind !== 'participant' || target.transformKey !== 'root') return undefined;
        const rs = target.roomSessionId;
        if (!latest.has(rs)) return undefined;
        return {
          sample: () => {
            const e = latest.get(rs);
            return e?.pose && { position: [...e.pose.position], rotation: [...e.pose.rotation] };
          },
          extension: (codecId) => (codecId === BONE_POSE_CODEC_ID ? latest.get(rs)?.bones : undefined),
        };
      },
    },
    voice: {
      onRemotePcmFrame(fn) {
        pcmHandlers.add(fn);
        return () => pcmHandlers.delete(fn);
      },
    },
    async leaveRoom() {
      if (!joined) return;
      joined = false;
      for (const stop of stops.splice(0)) stop();
      for (const p of peers.values()) emit('peerLeft', p);
    },
    disconnect() {
      for (const stop of stops.splice(0)) stop();
    },
  };
  return { client, durationMs: SCENE_DURATION_MS };
}

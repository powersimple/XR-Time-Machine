// A stand-in for an altspace.js room client that plays a scene (see ./scenario.mjs and ./scenarios/).
// It implements the parts of the RoomClient API a recorder uses, with the same shapes:
//   on(event, fn) -> off, joinRoom(), getPeers(), getPeer(), transforms.view(target).sample()/.extension(),
//   voice.onRemotePcmFrame(), leaveRoom(), disconnect()  (so altspace.js's own hardLeave() works on it)
// Time comes from a clock (see ../../core/clock.mjs): virtual for instant runs, or wall-clock for real time.
// The scene's faults are played too: mutes, voice delivery stalls, frozen transforms, low transform rates.
import { BONE_POSE_CODEC_ID, encodeBonePose, guestAvatarTriple } from 'altspace.js';
import { buildScene, VOICE_SAMPLE_RATE } from './scenario.mjs';
import { campfire } from './scenarios/index.mjs';

const TICK_HZ = 60;
const BONE_POSE_HZ = 30;
const FRAME_MS = 10;
const FRAME_SAMPLES = (VOICE_SAMPLE_RATE * FRAME_MS) / 1000;

export function createMockRoomClient({ clock, scene = buildScene(campfire), displayName = 'Mock bot' }) {
  const listeners = new Map();
  const pcmHandlers = new Set();
  const stops = [];
  const present = new Map(); // peerId -> { c, view }
  const latest = new Map(); // roomSessionId -> { pose, bones, updatedAt }
  const queued = []; // voice frames held back during a delivery stall
  let joined = false;
  let voiceSample = 0;
  let boneSlot = -1;

  const local = { peerId: 'p-local', roomSessionId: 'rs-local', displayName, isLocal: true };
  const triple = guestAvatarTriple();

  function emit(event, value) {
    for (const fn of listeners.get(event) ?? []) {
      try { fn(value); } catch (error) { console.warn(`mock ${event} listener threw:`, error); }
    }
  }

  // A reconnect with the same peerId keeps its room session, as the SDK does when it gets the session back.
  const peerView = (c, session) => ({
    peerId: session.peerId, roomSessionId: `rs-${session.peerId}`, userId: c.userId, displayName: c.displayName, isLocal: false,
    userState: { ...triple, avatarImage: '', muted: '0', cam: '', handRaise: '' },
  });

  function tick() {
    const t = clock.now();
    // Joins and leaves.
    for (const [peerId, p] of present) {
      if (!scene.sessionAt(p.c, t) || scene.sessionAt(p.c, t).peerId !== peerId) {
        present.delete(peerId);
        latest.delete(p.view.roomSessionId);
        emit('peerLeft', p.view);
      }
    }
    for (const c of scene.characters) {
      const session = scene.sessionAt(c, t);
      if (session && !present.has(session.peerId)) {
        const view = peerView(c, session);
        present.set(session.peerId, { c, view });
        emit('peerJoined', view);
      }
    }
    // Transforms, at each peer's own rate, unless frozen.
    for (const { c, view } of present.values()) {
      const entry = latest.get(view.roomSessionId) ?? {};
      const due = entry.updatedAt === undefined || t - entry.updatedAt >= 1000 / scene.transformHz(c) - 0.5;
      if (due && !scene.isFrozen(c, t)) {
        entry.pose = scene.rootAt(c, t);
        entry.updatedAt = t;
      }
      latest.set(view.roomSessionId, entry);
    }
    // Bone poses at 30 Hz (in step with the clock, so a late tick still lands on the right slot).
    const slot = Math.floor((t * BONE_POSE_HZ) / 1000);
    if (slot !== boneSlot) {
      boneSlot = slot;
      for (const { c, view } of present.values()) {
        const entry = latest.get(view.roomSessionId);
        if (scene.isFrozen(c, t)) continue;
        entry.bones = scene.hasBonesAt(c, t) ? encodeBonePose(scene.bonePoseAt(c, t)) : undefined;
      }
    }
  }

  // Timers run late, so produce every 10 ms frame that is due by now. Frames made during a delivery stall
  // are held, then all delivered at once when it ends: a burst, as from a real network.
  function voiceTick() {
    const now = clock.now();
    while (((voiceSample + FRAME_SAMPLES) / VOICE_SAMPLE_RATE) * 1000 <= now) {
      const start = voiceSample;
      voiceSample += FRAME_SAMPLES;
      const frameMs = (start / VOICE_SAMPLE_RATE) * 1000;
      for (const { c, view } of present.values()) {
        if (scene.isMuted(c, frameMs)) continue;
        queued.push({ samples: scene.voiceSamples(c, start, FRAME_SAMPLES), sampleRate: VOICE_SAMPLE_RATE, channels: 1, peerId: view.peerId, producerId: `mic-${c.id}` });
      }
    }
    const stalled = scene.faults.voiceStalls.some((s) => now >= s.fromMs && now < s.toMs);
    if (stalled || !pcmHandlers.size) { if (!pcmHandlers.size) queued.length = 0; return; }
    for (const frame of queued.splice(0)) {
      if (!present.has(frame.peerId)) continue; // the peer left while their audio was held back
      for (const fn of pcmHandlers) {
        try { fn(frame); } catch { /* the real client swallows handler errors too */ }
      }
    }
  }

  const client = {
    isMock: true,
    scene,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    async joinRoom({ roomId = `mock-${scene.name}`, requestedInstance } = {}) {
      joined = true;
      stops.push(clock.every(1000 / TICK_HZ, tick), clock.every(FRAME_MS, voiceTick));
      tick();
      const result = { roomId, assignedInstance: requestedInstance ?? 'mock' };
      emit('roomJoined', result);
      return result;
    },
    getPeers() {
      return [local, ...[...present.values()].map((p) => p.view)];
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
      for (const p of present.values()) emit('peerLeft', p.view);
      present.clear();
    },
    disconnect() {
      for (const stop of stops.splice(0)) stop();
    },
  };
  return { client, durationMs: scene.durationMs };
}

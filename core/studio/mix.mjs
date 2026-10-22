// Audio mixes from the per-speaker voice stems, following the program camera.
//   mic'd   everyone dry and centred, as if each wore a lavalier mic (what the stems already are, summed)
//   spatial each voice panned and attenuated by where the speaker is relative to the program camera
// Per-person modes (project.audio[peerId] = 'micd' | 'spatial') pick which one each person uses in the program mix.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dot, length, normalize, sub } from './math.mjs';

function readStem(rec, peer) {
  if (!peer.voiceFile) return null;
  const wav = readFileSync(join(rec.dir, peer.voiceFile));
  return new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.length));
}

// Returns interleaved stereo Int16 for the whole recording.
// cameraAt(frame) -> { eye, target } of the program camera; modes: { [peerId]: 'micd' | 'spatial' }; defaultMode for the rest.
export function mixProgram(rec, { fps, frames, cameraAt, modes = {}, defaultMode = 'micd' }) {
  const rate = rec.session.voiceSampleRate;
  const total = Math.round((frames / fps) * rate);
  const left = new Float32Array(total), right = new Float32Array(total);
  const perFrame = rate / fps;
  for (const peer of rec.peers.values()) {
    const stem = readStem(rec, peer);
    if (!stem) continue;
    const mode = modes[peer.id] ?? defaultMode;
    let gl = 0.7, gr = 0.7; // mic'd: centred (-3 dB each side)
    for (let f = 0; f < frames; f++) {
      if (mode === 'spatial') {
        const state = rec.stateAt(peer.id, (f / fps) * 1000);
        const cam = cameraAt(f);
        if (state && cam) {
          const to = sub(rec.head(state), cam.eye);
          const d = length(to);
          const fwd = normalize(sub(cam.target, cam.eye));
          const right = normalize([fwd[2], 0, -fwd[0]]); // left-handed, y up
          const pan = Math.max(-1, Math.min(1, dot(normalize(to), right))); // -1 left … +1 right
          const gain = 1 / (1 + 0.35 * Math.max(0, d - 1)); // gentle distance falloff beyond 1 m
          const angle = ((pan + 1) * Math.PI) / 4; // constant-power pan
          gl = Math.cos(angle) * gain; gr = Math.sin(angle) * gain;
        }
      }
      const a = Math.round(f * perFrame), b = Math.min(total, Math.round((f + 1) * perFrame));
      for (let i = a; i < b && i < stem.length; i++) { const v = stem[i] / 32768; left[i] += v * gl; right[i] += v * gr; }
    }
  }
  // Soft-limit the sum so overlapping voices never clip.
  const out = new Int16Array(total * 2);
  for (let i = 0; i < total; i++) {
    out[i * 2] = Math.round(Math.tanh(left[i] * 1.2) * 32000);
    out[i * 2 + 1] = Math.round(Math.tanh(right[i] * 1.2) * 32000);
  }
  return out;
}

export function stereoWav(samples, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples.length * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]);
}

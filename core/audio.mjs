// PCM helpers for voice stems. No dependencies, so any platform plugin can use them.

export const SAMPLE_RATE = 48_000;

export function downmix(samples, channels) {
  if (channels === 1) return new Float32Array(samples);
  const out = new Float32Array(Math.floor(samples.length / channels));
  for (let n = 0, i = 0; n < out.length; n++, i += channels) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += samples[i + c];
    out[n] = sum / channels;
  }
  return out;
}

export function resampleLinear(samples, fromRate, toRate) {
  if (fromRate === toRate) return new Float32Array(samples);
  const out = new Float32Array(Math.round((samples.length * toRate) / fromRate));
  if (!samples.length) return out;
  const last = samples.length - 1;
  const step = fromRate / toRate;
  for (let i = 0; i < out.length; i++) {
    const x = i * step;
    const k = Math.floor(x);
    out[i] = k >= last ? samples[last] : samples[k] + (samples[k + 1] - samples[k]) * (x - k);
  }
  return out;
}

// Float [-1, 1] to 16-bit, rounding to nearest and clamping; NaN becomes silence.
export function floatToS16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    out[i] = v !== v ? 0 : Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  }
  return out;
}

// Mono 16-bit WAV from a list of Int16Array chunks.
export function wavBytes(chunks, sampleRate = SAMPLE_RATE) {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + samples * 2, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(samples * 2, 40);
  return Buffer.concat([header, ...chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))]);
}

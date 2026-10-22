// Repairs a recording whose recorder died before stop(): crash, kill, power loss.
//   node core/recover.mjs <recording folder>
// What survives a crash: poses.jsonl and events.jsonl up to their last flushed line, every voice sample already
// committed (written synchronously, so all but the last ~300 ms of look-ahead), and session.json as of the last
// join or leave. This fixes the WAV headers (written as zero-length until stop), drops a torn last line from the
// JSONL files, and marks the session "recovered" with the duration that actually survived.
import { closeSync, existsSync, openSync, readFileSync, readdirSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wavHeader } from './audio.mjs';

export function recoverRecording(dir) {
  const sessionPath = join(dir, 'session.json');
  if (!existsSync(sessionPath)) throw new Error(`${dir}: no session.json, so not a recording folder`);
  const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
  if (session.status === 'complete') return { session, repaired: [] };
  const repaired = [];

  // JSONL: keep whole lines only (a crash can cut the last one short).
  let lastMs = 0;
  for (const file of ['poses.jsonl', 'events.jsonl']) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    const lines = text.split('\n');
    const good = [];
    for (const line of lines) {
      if (!line) continue;
      try { const o = JSON.parse(line); good.push(line); lastMs = Math.max(lastMs, o.t ?? 0); } catch { /* torn line */ }
    }
    const fixed = good.join('\n') + (good.length ? '\n' : '');
    if (fixed !== text) { writeFileSync(path, fixed); repaired.push(`${file}: dropped a torn last line`); }
    if (file === 'poses.jsonl') session.poseSamples = good.length; // the stats in session.json date from its last write
  }

  // WAVs: the header's sizes are only written at stop; set them from the file size.
  for (const file of readdirSync(dir).filter((f) => /^voice-.*\.wav$/.test(f))) {
    const path = join(dir, file);
    const bytes = statSync(path).size;
    const samples = Math.floor((bytes - 44) / 2);
    const fd = openSync(path, 'r+');
    writeSync(fd, wavHeader(samples, session.voiceSampleRate), 0, 44, 0);
    closeSync(fd);
    lastMs = Math.max(lastMs, (samples / session.voiceSampleRate) * 1000);
    repaired.push(`${file}: header set to ${(samples / session.voiceSampleRate).toFixed(2)} s`);
  }
  // Voice files the session didn't know about yet (a voice that started after the last roster write).
  for (const [id, peer] of Object.entries(session.peers ?? {})) {
    if (!peer.voiceFile && existsSync(join(dir, `voice-${id}.wav`))) peer.voiceFile = `voice-${id}.wav`;
  }

  session.status = 'recovered';
  session.durationMs = Math.round(lastMs);
  session.recoveredAt = new Date().toISOString();
  writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  return { session, repaired };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node core/recover.mjs <recording folder>'); process.exit(1); }
  const { session, repaired } = recoverRecording(dir);
  console.log(session.status === 'complete' ? `${dir} is complete; nothing to recover.` : `Recovered ${dir}: ${(session.durationMs / 1000).toFixed(1)} s survived.\n  ${repaired.join('\n  ')}`);
}

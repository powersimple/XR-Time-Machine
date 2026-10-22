// One participant's voice: places each arriving frame on the recording's timeline and streams it to a WAV file.
//
// Frames carry no timestamps, only their arrival time, and arrival is noisy: frames come late and in bursts,
// and stop entirely while someone is muted. The audio's own sample count is the clock. Placement rules:
//  - A run of audio starts at the earliest time consistent with every frame's arrival (frames can be late,
//    never early): its "lead".
//  - Each frame's lateness is how far its arrival trails where the run predicts it. A burst after a delivery
//    stall shows high lateness that falls back to ~0 as the burst catches up. A real gap (a mute, a dropout)
//    shows lateness that stays high. So a run is split only when lateness stays above GAP_MS for LOOKAHEAD_MS
//    of arrival time. To allow that, frames are committed to disk only once they're LOOKAHEAD_MS old.
//  - Speech detection runs on committed frames, so its times always match the audio's place in the file.
import { closeSync, openSync, writeSync } from 'node:fs';
import { SAMPLE_RATE, wavHeader } from './audio.mjs';

const MS = SAMPLE_RATE / 1000;
const LOOKAHEAD_MS = 300;
const GAP_MS = 40;
const SPEAKING_RMS = 0.01;
// Long enough to bridge the gaps between syllables and words, so one turn isn't split into many.
const SPEAKING_HOLD_MS = 400;

export class VoiceTrack {
  constructor(path, { onSpeaking } = {}) {
    this.path = path;
    this.fd = openSync(path, 'w');
    writeSync(this.fd, wavHeader(0)); // sizes patched on close; tools/recover can fix them after a crash
    this.cursor = 0; // samples written to disk
    this.run = null; // { lead, samples, committed } for the current run of audio
    this.pending = []; // [{ pcm, rms, arrived, offset }] not yet committed; offset = position within its run
    this.candidate = -1; // index in pending of an unsettled jump in lateness (a possible gap), or -1
    this.prevLateness = null; // the previous frame's lateness in this run
    this.onSpeaking = onSpeaking ?? (() => {});
    this.speaking = false;
    this.lastLoud = -Infinity;
    this.runs = 0;
  }

  // pcm: Int16Array at 48 kHz mono; rms: loudness of the frame; arrivedMs: arrival on the recording clock.
  push(pcm, rms, arrivedMs) {
    const arrived = arrivedMs * MS;
    if (!this.run) this.startRun(arrived - pcm.length);
    const frame = { pcm, rms, arrived, offset: this.run.samples };
    this.run.samples += pcm.length;
    // Until a run commits anything, refine its lead: the earliest start every frame so far agrees with.
    if (!this.run.committed) this.run.lead = Math.min(this.run.lead, arrived - this.run.samples);
    this.pending.push(frame);
    const newest = this.pending.length - 1;

    let lateness = this.latenessOf(newest);
    const jumped = this.prevLateness !== null && lateness - this.prevLateness > GAP_MS * MS;
    if (this.candidate >= 0 && lateness <= GAP_MS * MS) {
      this.candidate = -1; // it caught up: that was a burst, not a gap
    } else if (this.candidate >= 0 && jumped) {
      // A second jump before the first was settled (e.g. a burst, then a mute, then the unmute): settle the first.
      if (this.isBurst(this.candidate, newest - 1)) this.candidate = -1;
      else { this.split(newest); lateness = this.latenessOf(this.pending.length - 1); }
    }
    if (this.candidate < 0 && lateness > GAP_MS * MS && (jumped || this.prevLateness === null)) this.candidate = this.pending.length - 1;
    this.prevLateness = lateness;
    // Lateness held for the look-ahead: settle it (a gap, unless the frames came in faster than real time).
    if (this.candidate >= 0 && arrived - this.pending[this.candidate].arrived >= LOOKAHEAD_MS * MS) {
      if (this.isBurst(this.candidate, this.pending.length - 1)) this.candidate = -1;
      else this.split();
    }
    this.commit(arrived - LOOKAHEAD_MS * MS);
  }

  // How far pending[i] arrived after where its run predicts it ends.
  latenessOf(i) {
    const f = this.pending[i];
    return f.arrived - (this.run.lead + f.offset + f.pcm.length);
  }

  // Did pending[i..j] arrive faster than real time? A burst of held-back audio arrives all at once; audio after a
  // real gap arrives at its own pace. A lone frame gives no evidence either way; keep it with the run (a burst).
  isBurst(i, j) {
    if (j <= i) return true;
    let audio = 0;
    for (let k = i + 1; k <= j; k++) audio += this.pending[k].pcm.length;
    return this.pending[j].arrived - this.pending[i].arrived < audio / 2;
  }

  startRun(lead) {
    this.run = { lead, samples: 0, committed: false };
    this.prevLateness = null;
    this.runs++;
  }

  // A real gap at the candidate: the frames from there on start a new run. Its start is the earliest consistent
  // with the arrivals of the frames before pending index `end` (a later frame may sit after another gap).
  split(end = this.pending.length) {
    const count = end - this.candidate;
    const moved = this.pending.splice(this.candidate);
    this.candidate = -1;
    this.commit(Infinity);
    this.startRun(Infinity);
    moved.forEach((f, k) => {
      f.offset = this.run.samples;
      this.run.samples += f.pcm.length;
      if (k < count) this.run.lead = Math.min(this.run.lead, f.arrived - this.run.samples);
      this.pending.push(f);
    });
  }

  // Write every pending frame that arrived before `before` (and isn't part of an unresolved candidate gap).
  commit(before) {
    let n = 0;
    const limit = this.candidate >= 0 ? this.candidate : this.pending.length;
    while (n < limit && this.pending[n].arrived <= before) n++;
    if (!n) return;
    const lead = Math.round(this.run.lead);
    for (const f of this.pending.splice(0, n)) {
      let pcm = f.pcm;
      let at = lead + f.offset;
      if (at < 0) { pcm = pcm.subarray(Math.min(pcm.length, -at)); at = 0; } // started before the recording
      if (at < this.cursor) { pcm = pcm.subarray(Math.min(pcm.length, this.cursor - at)); at = this.cursor; }
      if (at > this.cursor) {
        // A gap (mute, dropout) is silence too: without this a turn would never end across a long mute.
        this.write(new Int16Array(at - this.cursor));
        this.detectSpeech(0, this.cursor / MS);
      }
      if (pcm.length) this.write(pcm);
      this.detectSpeech(f.rms, this.cursor / MS, pcm.length / MS);
    }
    if (this.candidate >= 0) this.candidate -= n;
    this.run.committed = true;
  }

  write(pcm) {
    writeSync(this.fd, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    this.cursor += pcm.length;
  }

  // endMs: where the frame ends on the timeline; frameMs: its length (frames needn't be 10 ms).
  detectSpeech(rms, endMs, frameMs = 0) {
    if (rms > SPEAKING_RMS) {
      this.lastLoud = endMs;
      if (!this.speaking) { this.speaking = true; this.onSpeaking('started', Math.round(endMs - frameMs)); }
    } else if (this.speaking && endMs - this.lastLoud > SPEAKING_HOLD_MS) {
      this.speaking = false;
      this.onSpeaking('stopped', Math.round(this.lastLoud));
    }
  }

  // Commit everything held back (e.g. the participant left), resolving any open gap from what has arrived.
  flush() {
    // An unsettled jump: a gap only if what followed it arrived at real-time pace (e.g. not a burst cut short by a leave).
    if (this.candidate >= 0) { if (this.isBurst(this.candidate, this.pending.length - 1)) this.candidate = -1; else this.split(); }
    this.commit(Infinity);
    if (this.speaking) { this.speaking = false; this.onSpeaking('stopped', Math.round(this.lastLoud)); }
    this.run = null; // the next frame starts a new run, placed by its own arrival
  }

  close() {
    this.flush();
    writeSync(this.fd, wavHeader(this.cursor), 0, 44, 0);
    closeSync(this.fd);
    return { samples: this.cursor, runs: this.runs };
  }
}

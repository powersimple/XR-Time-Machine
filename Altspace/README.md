# Altspace plugin

Records Altspace worlds through the altspace.js bot SDK, and exports them for editing. [adapter.mjs](adapter.mjs) turns a room client, live or mock, into a [core source](../core/source.mjs). [codec.mjs](codec.mjs) turns recorded Altspace bone poses into skeletons for the studio.

## Setup

Node 22.12+, then `npm install`, then copy `.env.example` to `.env` and add your client id. `npm run check` confirms everything is in place. `scripts/fetch-reference-docs.sh` downloads the Altspace SDK docs into `reference/` (git ignores them, since they're SideQuest's).

## Commands

```bash
npm test                                   # everything that's quick: all scenarios instantly, two in real time, a crash
npm run test:full                          # plus the 10-minute scenario and every scenario in real time (~9 min)
npm run test:studio                        # record, export 4 s of studio media, check every file (~10 s)

npm run record:mock -- --scenario crowd    # record a mock scenario into recordings/
npm run record -- altspacecampfire         # record a live world as a guest bot (--seconds 0: until Ctrl-C)
npm run studio -- recordings/<folder>      # cameras, program cut, mixes and Premiere/OTIO timelines → <folder>/studio/
npm run recover -- recordings/<folder>     # repair a recording whose recorder died (crash, kill, power cut)
```

## The mock room and its scenarios

[mock/mock-room.mjs](mock/mock-room.mjs) is a fake altspace.js room client. It uses the SDK's real types, rig and bone-pose codec, so the same adapter and recorder run on it and on a live room. It plays a **scenario** from [mock/scenarios/index.mjs](mock/scenarios/index.mjs), each aimed at a way recording can go wrong:

| Scenario | What it tests |
|---|---|
| `campfire` | Three people take turns, one joins late and walks, two laugh over each other |
| `crowd` | Ten people arrive over 5 s, three leave early, three-way crosstalk, wandering |
| `reconnect` | One person drops for 1 s and reconnects as the same peer; another leaves and returns as a new peer |
| `mutes` | Mutes of 80, 150 and 250 ms mid-sentence, a 2 s mute, someone muted throughout, a mute ending mid-syllable |
| `network` | Voice delivery stalls (400 and 150 ms) then bursts, a frozen transform, a 150 ms process stall, a peer at 10 Hz |
| `bones` | One peer never sends bone poses; another starts 2 s after joining |
| `edge` | A 20 ms blink in and out, a non-ASCII name, someone leaving at 0.5 s, an empty room at the end |
| `chaos` | Everything at once, seeded: 16 people over 45 s, churn, both kinds of reconnect, random mutes, 30% overlapping speech, three stalls, two freezes, low-rate and boneless peers |
| `long` | Four people, ten minutes, procedurally scripted (memory, disk, speed) |

A scenario is plain data: people, sessions, walks, mutes, bones, lines and faults. Its format is documented at the top of [mock/scenario.mjs](mock/scenario.mjs).

## The golden harness

[test/harness.mjs](test/harness.mjs) works out from a scenario alone what a perfect recorder would write ([test/expected.mjs](test/expected.mjs)). It then compares the recorder's output line by line and sample by sample:

- **Poses:** every `poses.jsonl` line must equal the scene at some moment within its publish window, to quantization level (≤ 1 mm, ≤ 0.5°). Instant runs must also hit the exact sample schedule; real-time runs must have no hole that a measured event-loop stall doesn't explain.
- **Events:** every join, leave, rejoin and speech turn, to within 40/50 ms.
- **Voices:** every 10 ms frame of every stem must match the source sample for sample, and every muted or absent stretch must be silent. Real-time runs allow each run of audio ±5 ms placement, and report it; it's about 1–2 ms in practice.
- **Session file:** roster, names, sessions, durations and status.

Every mismatch goes into `harness-report.txt` in the recording folder, by file and line. To prove the harness catches real bugs, five deliberate recorder bugs were each run against it, and each failed the run: no gap detection, mute not ending speech, the old reconnect bug, no look-ahead, and a leave always treated as a gap.

`--crash` runs a real-time recording in a child process, kills it with SIGKILL at 6 s, recovers it with `core/recover.mjs`, and checks what survived. Everything up to the last ~0.3 s does.

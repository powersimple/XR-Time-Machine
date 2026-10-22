# Overnight handoff (22 Oct 2026)

Everything below is in the working tree, **uncommitted**. Review it with `git status` / `git diff`, then commit when you're happy. Nothing was pushed, and nothing touched the live Altspace servers.

## Try this first (about 5 minutes)

1. **Premiere → Settings → Plugins →** tick **Enable developer mode**, then restart Premiere.
2. Double-click `editors/Premiere/dist/org.xrtimemachine.premiere_premierepro.ccx` and accept the warning that it isn't from the Marketplace.
3. In Premiere, open any project, then go to **Window → UXP Plugins → XR Time Machine**.
4. Click **Open recording folder…** and choose `Altspace/recordings/demo-crowd`, or `demo-campfire` for the short one. **`engage-fmc4-part1`** is one real minute of your FMC4 session: 14 people at their real positions, with the room audio.
5. Click **Import timeline into project**. Then try the camera buttons (switch angle at the playhead) and click speech turns to jump.

If the panel misbehaves, its **Log** section says why. Two fallbacks:
- `studio/sequence.xml` imports with plain **File → Import**, without the panel.
- The movies in `studio/cameras/` and `studio/program.mov` play in QuickTime.

## What got built

### Recorder: hardened against 9 scenarios
- **The mock is now a scenario engine** (`Altspace/mock/scenarios/`): crowd, reconnect, mutes, network faults, missing bones, edge cases, a 10-minute session, and `chaos` (16 people, every fault at once).
- **The golden harness** checks every pose line, event and audio sample against each scenario's script. It runs instantly (exact), in real time (real timers and stalls) and as a crash test (SIGKILL mid-recording, then recovery).
- **Results:** all pass. Poses match to quantization level (≤ 1 mm, ≤ 0.5°). Voice stems match the source sample for sample; in real time each run of audio lands within 1–2 ms.
- **The harness catches bugs:** five deliberate recorder bugs were each caught.

Recorder bugs found and fixed:
- **Short mutes misplaced audio.** After a mute under 200 ms, later audio was placed early by the length of the mute. Voices now go through `core/voice-track.mjs`, which holds 300 ms of look-ahead and tells a real gap (audio stays late) from a delivery burst (audio catches up).
- **Speech turns never ended across a mute,** since no frames arrive while muted. The silence the recorder writes for a gap now counts.
- **Reconnecting with the same peer id stopped that person being recorded.** The roster now tracks join/leave sessions.
- **Voice audio was held in RAM,** about 6 GB for a 2-hour, 20-person event. It now streams to disk. Memory is flat (9 MB heap across 10 minutes).
- **A crash lost everything.** `session.json` is now written atomically at start and on every roster change, audio is written as it's committed, and `npm run recover` repairs the WAV headers and session afterwards.
- **Ctrl-C** on a live recording now finishes the files properly, and errors while recording are no longer reported as join failures.
- **A burst cut short was taken for a gap (found by chaos).** Audio held back by a network stall, followed by a mute or a leave before it could catch up, was placed about 100 ms late. Gaps are now told from bursts by arrival pace: held-back audio arrives all at once, audio after a real gap at its own speed.
- **Pose times were rounded to whole milliseconds (found by chaos).** At walking speed that's already about 1 mm of error. They now keep 0.1 ms.

### Studio: a recording becomes editor-ready media (`core/studio/`)
- **Cameras:**
  - fixed (wide, overhead)
  - orbit
  - a speaker camera that follows whoever is talking
  - a close-up per person

  All moves use spring smoothing, from your wishlist (easing, follow modes, any number of cameras).
- **Auto-director:**
  - opens on an establishing wide
  - cuts to the speaker's close-up a few frames before they start
  - goes wide, with a dissolve, when several people talk
  - waits a minimum shot length, unless the person on screen has stopped talking

  The cut is data in `project.json`, so it stays editable.
- **Renderer:** stick-figure avatars from the recorded skeletons, with name tags, a speaking ring, facing and a floor grid. It's pure Node.
- **Movies:** Photo-JPEG QuickTime, decoded by macOS's own video framework (checked with `avconvert`). Rendering runs on 8 worker threads: about 64 s for 10 s × 8 movies at 1280×720 on this laptop.
- **Audio:**
  - `mix-micd.wav`: everyone dry, like a lavalier mic
  - `mix-spatial.wav`: voices panned and attenuated from the program camera
  - per-person modes, from your wishlist

  The original per-speaker stems also go on the timeline.
- **Timelines:**
  - `sequence.xml` (FCP7 XML for Premiere): the program cut built from the iso clips, every camera on its own track, mixes and stems, and a marker per speech turn and join/leave
  - `timeline.otio`: the same layout as OpenTimelineIO

### ENGAGE converter (`ENGAGE/tools/convert_myrec.py`)
- Turns a `.myrec`, or any slice of one, into an XR Time Machine recording: positions, headings, names, joins and leaves, and the room audio placed per 5 s chunk.
- From there it renders and edits like any other recording. ENGAGE has no per-speaker audio, so the director tours the cameras instead.
- Avatars are capsules until ENGAGE's 50-bone skeleton is mapped.
- Found along the way: the recording account's own "Camera" avatar sits at the origin, and it skewed the framing. The converter now skips it, and the studio's group bounds ignore strays.

### Premiere panel (`editors/Premiere/`)
- **Features:** import the timeline, switch angle at the playhead, jump to speech, per-person audio modes, and send the V1 cut back to `project.json` for re-render.
- **API:** taken from Adobe's 26.3 reference and their official sample panel (your Premiere is 26.3.0).
- **Tests:** 10 logic tests against a fake Premiere that applies edits the way Premiere does. The real panel also runs in a browser preview: `node editors/Premiere/test/preview-server.mjs`.
- **Never run inside Premiere,** so expect small fixes. The README lists the three most likely ones.

## Commands

```bash
cd Altspace
npm test              # all scenarios instantly + two in real time + a crash test (~1 min)
npm run test:full     # + the 10-minute scenario + every scenario in real time (~9 min)
npm run test:studio   # studio export checks (~10 s)
npm run studio -- recordings/demo-crowd
cd ../editors/Premiere && npm test && npm run package
```

## Known limits and next steps

- **Rendering speed.** About 1 s of footage per 6 s of wall clock with 8 cameras at 720p. An hour-long event would take hours. Next options:
  - render fewer cameras (only the ones the cut uses, plus a wide)
  - a lower-resolution preview pass
  - a GPU or Unity renderer, which is Phase 5 in PLAN.md
- **Stick figures,** not real avatars. Faithful avatars need SideQuest's avatar pipeline; that's the open question for Shane in PLAN.md.
- **No live recording run yet** on the new recorder. The live path (`npm run record -- altspacecampfire`) uses the same code as the mock, so one 30-second run is the next real-world check.
- **The panel needs a first run in Premiere** (above).
- **The recording format is still the dev format** (JSONL + WAV). MCAP waits on installing `@mcap/core`, which needs your OK.
- **Resolve plugin:** on hold as asked. The OTIO file is already the bridge.

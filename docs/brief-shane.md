# XR Time Machine: progress brief

**For Shane Harris (Altspace) · from Ben Erwin · October 2026**

## The idea

Record an Altspace session as **data, not video**: every avatar's motion, every voice on its own track, and who joined, left and spoke when. Then replay it, re-shoot it from any angle with virtual cameras placed after the fact, and hand it to Premiere or Resolve as ordinary multicam footage.

## Virtualization: the core strategy

Everything is built and proven against **virtual Altspace sessions** before it touches the live service.

- **A virtual room.** A stand-in for an Altspace room speaks the same API as the altspace.js bot SDK, with the real types, rig and bone-pose codec. The recorder can't tell it from a live world, so we iterate all day without loading your servers.
- **Scripted scenarios.** Each virtual session is plain data: who's there, where they walk, what they say and when, plus faults. There are 9 scenarios so far:
  - a three-person campfire
  - a 10-person crowd with crosstalk
  - reconnects with the same and a new peer ID
  - mutes, from 80 ms to the whole session
  - network delivery stalls and bursts, and frozen transforms
  - process stalls and low-rate peers
  - avatars without bone data
  - a 10-minute session
  - "chaos": 16 people with every fault at once
- **Virtual time.** A deterministic clock runs a 10-minute session in seconds with exact, repeatable timing. The same scenarios also run on the real clock, with real timer jitter and simulated CPU stalls.
- **A golden harness.** From each script it computes what a perfect recording should contain. It then checks the recorder's output line by line and sample by sample: positions to under 1 mm, rotations to under 0.5°, every voice sample exact, and every join, leave and speech turn on time.
- **Proof the tests bite.** Five deliberately planted recorder bugs were each caught. A crash test kills the recorder mid-session and confirms the recording is recoverable.
- **Virtual cameras.** The same idea carries into editing. Cameras are data placed after the session, so you can shoot as many angles as you want, after the fact, with no extra load on the live world.

This approach found and fixed real bugs before any live run:
- audio misplaced after short mutes and network bursts
- speaking turns that didn't end across a mute
- reconnecting users dropping out of the recording
- unbounded memory on long sessions
- timestamp precision

## What's built

**Recorder (Phase 0).**
- A recorder bot built on altspace.js. It joins a world and captures every participant's position, full-body bone poses (30 fps) and **each speaker's voice as a separate track** (48 kHz).
- It streams to disk, stays crash-safe, and its memory doesn't grow with session length.
- It's verified by joining Campfire as a guest bot.

**Plugin architecture.**
- A platform-agnostic core records any "source".
- Altspace is a plugin (an adapter over altspace.js), so other platforms can be added the same way.
- Video editors are plugins too, and only read exported recordings.

**Studio export.** A recording becomes editor-ready media:
- **Virtual cameras:** wide, overhead, orbit, a speaker camera that follows whoever is talking, and a close-up per person, all with eased, spring-smoothed moves.
- **An auto-director:** it opens on an establishing wide, cuts to each speaker just before they talk, and goes wide with a dissolve during crosstalk. The cut is data, so every decision stays editable.
- **Audio:** a "mic'd" mix (everyone clean, like lavaliers), a "spatial" mix (voices placed from the camera), and the original per-person stems.
- **Timelines:** a Premiere-ready sequence (FCP XML) and an OpenTimelineIO file, with a marker for every speech turn.

**Premiere panel (UXP, Premiere 26).**
- Imports the timeline in one click.
- **Switches angle at the playhead,** like a multicam.
- Jumps to any speech turn.
- Sets each person to mic'd or spatial audio.
- Sends edits back for re-rendering.
- It's packaged and tested against a simulated Premiere API; first live run in Premiere is next.

## Next steps
- A first live recording session in an Altspace world, with your blessing.
- Faster rendering for long events: render only the cameras the cut uses, with a quick preview pass first.
- In-world replay of recordings as ghosts.
- A Resolve bridge (the OTIO export already covers the basics).

## Where we'd value your input
1. **Avatar rendering.** Renders use stand-in figures for now. Access to the avatar pipeline (or a headless render build) would make footage look like Altspace.
2. **A recorder inside the client,** long term, versus the bot approach.
3. **Consent and policy** for recording: a visible recorder bot, opt-in per world, voice-stem opt-out.

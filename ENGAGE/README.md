# ENGAGE plugin

Reads ENGAGE spatial recordings (`.myrec`) and converts them for the studio and the editors. The format notes are in [docs/myrec-format.md](docs/myrec-format.md).

```bash
python3 -I tools/inspect_myrec.py <file.myrec>                                   # roster, timing, frame rate
python3 -I tools/inspect_myrec.py <file.myrec> --stream 100                      # decode one chunk's poses
python3 -I tools/convert_myrec.py <file.myrec> <out folder> --start 10 --minutes 1   # → an XR Time Machine recording
```

The tools are pure Python with no dependencies. [tools/msp.py](tools/msp.py) decodes MessagePack and LZ4; audio decoding uses macOS's `afconvert`.

## Converting

`convert_myrec.py` writes a normal recording folder (`session.json`, `poses.jsonl`, `events.jsonl`, `voice-room.wav`). From there, `npm run studio -- <folder>` in `Altspace/` renders it and the Premiere panel opens it like any other recording. For example, `Altspace/recordings/engage-fmc4-part1` is minutes 10–11 of FMC4-Part1 with 14 people.

**What carries over:**
- every participant's root position and heading at ENGAGE's 30 fps, under their names
- joins and leaves
- the session audio

**Limitations:**
- **Only a mixed audio track.** ENGAGE stores one, so it becomes a "Room audio (mixed)" track. With no per-speaker voices there are no speech turns either, and the auto-director tours the cameras instead of following speakers.
- **Avatars are capsules.** ENGAGE's 50-bone skeleton isn't mapped to a rig yet, so avatars don't have skeletons. The bones are decoded already (see the format notes); mapping them is the next step.
- **ENGAGE's root sits at hip height,** so positions are lowered by 1.05 m. Feet then land at y ≈ 0 in FMC4.
- **The recording account's own avatar** (often a "Camera" user parked at the origin) is skipped, as the recorder skips its own bot.
- **Objects, media and whiteboards** aren't converted.
- **Audio placement:** each 5 s chunk's MP3 is decoded separately and placed at its chunk's start time, since each one carries its own encoder padding.

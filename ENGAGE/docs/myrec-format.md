# ENGAGE `.myrec` format: what we found

Reverse-engineered 2026-10-21 from 31 of Ben's own recordings (2023–2026), mainly `FMC4-Part1.myrec` and `FMC4-Part2.myrec`. Decoder: [tools/myrec/](../tools/myrec/).

**Verdict: not obfuscated and not encrypted.** Every layer is a standard format: ZIP, JSON, MessagePack, LZ4, MP3 and H.264. The only hidden part is field *meaning*: the MessagePack data uses positional arrays (MessagePack-CSharp `[Key(n)]` style), so there are no field names, and some fields are still unidentified.

## Layers

```
file.myrec                      ZIP (deflate)
├── count.txt                   "streamCount|744;sceneID|ugc-scene-7181-xi5i2q;"
├── master                      ZIP → master.txt
├── stream0 … streamN-1         ZIP per chunk (~140 frames ≈ 4.7 s at 30 fps)
│     ├── stream.msp            MessagePack, LZ4BlockArray-compressed: avatar poses
│     ├── events.txt            JSON: per-frame events + initial scene state
│     ├── whiteboard.msp        MessagePack: whiteboard strokes
│     └── audioothers.mp3       MP3 (LAME 3.99.5, 32 kHz, 48 kbps): mixed audio for the chunk
└── streamvideo0 … (optional)   raw H.264 Annex-B: in-world screen video for the chunk
```

Each chunk is self-contained, so a recording can be streamed or cut at chunk boundaries. The nested ZIPs make the outer deflate nearly useless: compressed and uncompressed sizes are almost the same.

## master.txt (JSON)

- `recording_version_string` "MasterRecordingVariablesV1", `recording_version` 1 or 2 (v2 from 2026)
- `recordingStreamFrames[]`, `recordingStreamTimes[]` and `recordingStreamStartTimes[]`: frames, duration and start time (seconds) of each chunk
- `totalFrames`, `totalTime`, `sceneID`, `sceneScale`, `myPlayerInt` (the recorder's player number)
- `originalAvaStartPosition` / `recordAvaStartPosition` / `recordAvaStartRotation`
- controller and hip offsets, `lipSyncSensitivity`, `screenControl`, `ifxControl`
- `avatar_variables_v1{playerInt → …}`: the participant roster
  - `name`, `serializedProfileJSON` (avatar customization string), `avatarSDKURL` (a Ready Player Me-style avatar id), `height`
  - `is6Dof` / `usingVR`, `hasFingerTracking`, `noIK`, `overrideIKMode`
  - `playerStartFrame` / `playerStartRec` (when they joined), `disableAvatarPlayback`

## stream.msp (MessagePack + LZ4)

- **Compression:** MessagePack-CSharp's Lz4BlockArray. The outer array starts with ext type 98 listing each chunk's uncompressed size, followed by `bin` LZ4 blocks. Decompressed size is about 2 MB per 140-frame chunk.
- **Top level:** `[frames[], []]`
- **Frame:** `[players[], meta]`. `meta` has looked like `[0, 0, 255, 0, 0, false]` in every frame examined (meaning unknown).
- **Player record:** `[playerInt, body, flags, extra]`
  - `body[0]`: root `[[x, y, z], [qx, qy, qz, qw]]` as float32, in Unity world space
  - `body[1]`: full-body pose, only every 3rd frame: `[[bone, pos3, rot4, scale3] × 50]`, **float16** local transforms (quaternions check out at |q| = 1)
  - `body[2]` and `body[3]`: 3 tracker poses each (pos3 + rot4, float16), probably head, left hand and right hand
  - `flags`: e.g. `[0, false, false, 186, -1, 0, 0, [[0], [0]], true]`. Field 3 is the avatar height in cm; the rest are unidentified (talking/emote/IK state?).
  - `extra`: `[[x, y, z], [euler3], scale]`, probably the head or camera world pose
- **Bandwidth implied:** about 15 KB per full-pose frame for 22 avatars, about 0.5 MB/s before LZ4.

## events.txt (JSON)

- `initial_ifx.shared_ifx.modules[]`: placed scene objects with `name`, `pretty_name`, `position`/`euler`/`scale`, lock and collider flags, and parent links
- `initial_location_network_states`, `initial_loaded_media_event`, `initial_threeDPenDrawings`
- `events[]`: one entry per frame: `{ifx_events, standard_events, ifx_net_states, ifx_net_states_reliable_message, reactions}`

## Audio

**Only one mixed track per chunk (`audioothers`).** There are no separate speaker stems, so voices can't be separated after the fact. This is the biggest editing limitation of the format, and per-speaker audio is the clearest place to do better.

## Data-quality finding

`FMC4-Part2.myrec` has 86.6 min of audio but only 679 motion frames (0.13 fps). The last chunk holds 119 frames across 5,194 seconds, so avatars will look nearly frozen in playback. All 30 other recordings capture motion at about 20–33 fps. The recorder appears to have stalled while audio kept going.

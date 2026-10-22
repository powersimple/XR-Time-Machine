# Altspace Spatial Recording: research and plan

Draft 1, 2026-10-21, for Ben Erwin and Shane Harris (Altspace / SideQuest)

> **Status, 22 Oct 2026.** Phase 0 is built and tested against the mock, along with an early slice of Phases 3 and 4. The recorder is hardened across 8 scenarios. The studio export renders cameras, an auto-directed program, mixes and Premiere/OTIO timelines. A Premiere UXP panel is built. See [HANDOFF.md](HANDOFF.md).

## The vision in one line

Record an Altspace session as **data, not video**: every avatar's motion, every voice on its own track, objects, media and events. Anyone can then replay it in-world, or edit it like footage, with cameras placed *after* the fact and output to Premiere and Resolve. The format and tools are open source.

## What we learned

### 1. ENGAGE's `.myrec` is readable. We can parse it today.

It's ZIPs inside a ZIP, holding JSON, LZ4-compressed MessagePack, MP3 and H.264. It is not obfuscated or encrypted. Our decoder ([ENGAGE/tools/](ENGAGE/tools/)) has decoded:
- the participant roster
- 30 fps root positions
- 50-bone full-body poses as float16
- head and hand trackers
- scene objects, events and in-world screen video

Details are in [ENGAGE/docs/myrec-format.md](ENGAGE/docs/myrec-format.md). The motion trajectories of all 17 avatars in FMC4-Part1 were extracted successfully.

What this tells us about ENGAGE's design:
- **Good ideas to keep:** self-contained ~5 s chunks, which are crash-tolerant and cut-friendly; full poses every 3rd frame; compact float16 bones.
- **Weaknesses to beat:**
  - one *mixed* audio track, so voices can't be separated or rebalanced
  - positional fields with no schema or spec
  - files tied to an engine and a scene id
  - no silent-stall detection (FMC4-Part2 lost almost all of its motion data without anyone noticing)
  - nested ZIPs that waste effort and prevent random access

### 2. ENGAGE's editor has a low bar to clear

Spatial recordings can be:
- trimmed at the head and tail, looped, and layered with other recordings
- edited to mute the main voice versus other voices
- edited to replace the main voice, or hide avatars

There are **no** cuts in the middle of a recording, **no virtual cameras**, and **no export of a spatial recording to video** (2D video comes from a separate recorder). Edits are saved as a new file.

### 3. Altspace already has half the pieces

- **The creator SDK** (`BS.Recording` and `BS.Newsroom`) already records MP4s on device from feeds, cameras or browsers. It also runs a multi-camera "program" with live cuts. That is the in-world director's booth.
- **The bot SDK** (`altspace.js`, working on Ben's Mac today) can:
  - read **every peer's transform and bone pose** (`client.transforms.view`, bone-pose extension)
  - receive **each speaker's voice as separate 48 kHz audio** (`voice.onRemotePcmFrame`)
  - read user and room state, the roster and events

  **A recorder bot can capture a full spatial session with per-speaker stems without changing the Unity client.** That gives us a working prototype in weeks, not quarters.
- **The app's MCP server** (Windows only) lets an AI agent move a player, take snapshots and transcribe people. This is useful later for automated "AI camera operator" passes and QA.

### 4. Premiere and Resolve: interchange first, plugins second

| | Premiere (26.x) | DaVinci Resolve (21.1) |
|---|---|---|
| Interchange | **Native OTIO** import/export, plus FCP XML | **Native OTIO** (`.otioz`), FCPXML, AAF; works in the free edition |
| Panel / automation | **UXP** (JS; GA since 25.6; C++ "Hybrid" add-ons since 26.2); sequences, keyframes, markers, OTIO export from code | **Workflow Integration** (Electron) + Python API, **Studio only as of 21.1** |
| Native custom format | C++ MediaCore **Importer**: a `.myrec`-style clip with multichannel audio and frames rendered on demand | No public decoder SDK; it isn't possible |
| Frames rendered in the editor | Importer or GPU effect (hard) | **OpenFX generator** with keyframable camera params; works in free (hard) |
| Avoid | CEP / ExtendScript (past their support window) | IO codec SDK (encode-only) |

**Conclusion:** OpenTimelineIO is the shared format between our tool and both editors. Version 1 ships no C++ plugins. Our tool renders the chosen cameras to ProRes or EXR, writes one WAV per speaker, and hands over an `.otio` file. Thin panels (UXP for Premiere, Workflow Integration for Resolve Studio) then add camera picking and re-rendering. Live in-editor rendering (C++ importer, OFX) comes later and is optional.

## Proposed architecture

```
 Altspace room ──► Recorder (bot now, native client later)
                     │  writes, append-only, crash-safe
                     ▼
          OSR file  (Open Spatial Recording = MCAP + published schemas)
          ├─ /session      roster, world id, asset refs, consent flags
          ├─ /avatar/{id}/pose     root + bones, 30–60 Hz, keyframe + delta
          ├─ /avatar/{id}/voice    Opus packets, one channel per speaker
          ├─ /object/{id}/xform    synced objects
          ├─ /media, /events, /whiteboard, /chat
          └─ /snapshot     full state every N s (fast seek)
                     │
       ┌─────────────┼───────────────────────────┐
       ▼             ▼                           ▼
  In-world replay   Spatial Studio (editor)    Converters
  (Altspace world   web/desktop: timeline,     .myrec → OSR (import ENGAGE
   plays OSR back    virtual cameras, per-      archives), OSR → glTF/USD,
   as ghosts)        speaker mix, renders       → WAV stems, → Rerun/Foxglove
                     ProRes/EXR/360 + .otio
                             │ OTIO round-trip
                ┌────────────┴────────────┐
                ▼                         ▼
        Premiere UXP panel        Resolve Workflow Integration
        (import, camera swap,     (Studio) + free-tier .otioz
         re-render, sync back)     import; OFX later
```

**Why MCAP:**
- open (MIT)
- append-only and crash-safe, with chunks plus an index for seeking
- many channels with nanosecond timestamps; zstd/lz4
- libraries in C++, TS, Python, Rust and Go
- free viewers (Foxglove) for debugging

We publish the channel schemas (protobuf or FlatBuffers) as a versioned spec, so other platforms, ENGAGE included, can read and write OSR. Edits live in an **OTIO sidecar**, never by rewriting the recording. A **glTF/USD exporter** lets Blender, Unity, Unreal and Fusion use recordings too.

**Rendering:**
- Primary: a headless Unity build of the Altspace client. This gives the same avatars, shaders and world, so footage looks like the real thing.
- Fallback / open reference: Blender (Eevee) via the glTF/USD export.

## Language stack

Schemas first: the OSR channel schemas are written once (protobuf), and each language uses code generated from them, so there's no shared core library to maintain.

| Language | Where | Why |
|---|---|---|
| **TypeScript** (main) | Recorder bot, Spatial Studio UI (web/Electron, WebGL/three.js preview), Premiere UXP panel, Resolve Workflow Integration, reference OSR reader/writer | `altspace.js` is JS-only; UXP and Resolve panels are JS; one language covers bot, editor and plugins |
| **C#** | In-world replay, native in-client recorder, headless Unity render build | Altspace is Unity; renders must use the real avatars and shaders |
| **Python** | `.myrec` converter, OTIO adapters, Resolve scripting, Blender export, analysis | Reference OTIO is Python/C++; Blender and Resolve script in Python |
| **C++** | Later only: Premiere importer / Hybrid add-on, Resolve OpenFX generator | The only languages those SDKs accept |
| **Go** (optional) | Backend, if we host: recording ingest and storage, render-farm job queue, `osr` single-binary CLI | Official MCAP Go library (the `mcap` CLI is Go); easy single-binary services |

## Phased plan

| Phase | Weeks | Deliverable | Proves |
|---|---|---|---|
| **0. Spike** | 1–2 | Recorder bot: joins a world, writes per-peer root/bone/voice to MCAP for 10 min. `.myrec` → MCAP converter. View both in Foxglove | Capture without client changes; the format choice works |
| **1. OSR v0.1 spec** | 2–4 | Published schemas and a channel profile, reference readers/writers (TS + C#), consent model | An open standard others can adopt |
| **2. Replay** | 4–8 | Altspace world/plugin that plays OSR back as ghosts in-world, with scrubbing. Needs SideQuest for avatar rendering from recorded bone poses | ENGAGE parity, in Altspace |
| **3. Spatial Studio MVP** | 6–12 | Timeline editor: cuts, trims, per-speaker gain/mute, unlimited fixed/follow cameras with easing, multicam switching with transitions, speaker-driven auto-director, mic'd vs spatial audio per person ([docs/studio-wishlist.md](docs/studio-wishlist.md)); render to ProRes + WAV stems + OTIO | Better than ENGAGE: cameras, cuts, stems |
| **4. NLE bridges** | 10–14 | Premiere UXP panel and Resolve Workflow Integration: import OTIO, swap camera angle, request re-render, sync edits back | The editors' last mile |
| **5. Native recorder + advanced** | 12+ | Recorder inside the Unity client (SideQuest), 360/VR180 output, AI auto-director (cuts on active speaker), transcripts and chapters, C++ importer / OFX for live render | Production quality and scale |

## Decisions we need from Shane / SideQuest

1. **Client access.** Will SideQuest build the in-client recorder and replay path, with us owning the spec, the Studio and the plugins? Or do we stay bot-side?
2. **Avatar rendering outside the app.** Can we get a headless or offline render build, or at least the avatar rig and assets (the "avatar triple"), to render faithful footage?
3. **Consent and policy.** Should recording use a visible recorder bot plus a world-level opt-in, and should participants be able to opt out of their voice stem? Who stores files, and for how long?
4. **License.** We suggest Apache-2.0 for the spec and libraries, and either MPL or Apache for Studio. Does that match SideQuest's terms for the SDK (`altspace.js` is currently UNLICENSED/proprietary)?
5. **ENGAGE import.** Converting your own `.myrec` archives is a strong migration story. Get a legal read on reading a competitor's format: interoperability is generally defensible, but confirm.

## Risks

- **Rendering fidelity.** Without SideQuest's avatar pipeline, renders won't look like Altspace. This is the biggest dependency.
- **Bot bandwidth / LOD.** A recorder bot may receive reduced-rate transforms for distant peers (the SDK has LOD controls). Measure this in Phase 0.
- **API churn.** Premiere UXP changes fast (26.3 broke code), and Resolve keeps moving features to Studio. Rely on OTIO and keep the plugins thin.
- **Privacy.** Per-speaker voice stems are powerful and sensitive. Consent design must ship with v1, not after.
- **Scope.** This is a product, not a feature. Phases 0–1 are cheap and build credibility before the larger commitments.

## Recommended next step

Build the **Phase 0 spike** this week: a recorder bot in Campfire plus the `.myrec` → MCAP converter, demoed in Foxglove. That gives Shane something concrete: *"here's your world, recorded as data, and here's an ENGAGE archive opening in the same viewer."*

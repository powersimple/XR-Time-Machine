# XR Time Machine

Record social VR sessions as data rather than video: every avatar's motion, every voice on its own track, and the events. Then replay them, edit them like footage with cameras placed after the fact, and hand the result to Premiere or Resolve. Open source.

The research and roadmap are in [PLAN.md](PLAN.md), the camera and audio wishlist for the editor in [docs/studio-wishlist.md](docs/studio-wishlist.md), and the latest status in [HANDOFF.md](HANDOFF.md).

## Plugin architecture

```
core/                  Platform-agnostic, no dependencies
  recorder.mjs         records any source: poses, events, one WAV per voice (streamed, crash-safe)
  voice-track.mjs      places voice frames on the timeline from arrival times alone (bursts, gaps, mutes)
  source.mjs           the contract a platform plugin implements
  recover.mjs          repairs a recording after a crash
  clock.mjs            wall clock, or a virtual clock for instant deterministic runs (with simulated stalls)
  audio.mjs            PCM helpers and WAV writing
  studio/              recording → editor-ready media: cameras, auto-director, renderer, Photo-JPEG .mov
                       writer, audio mixes (mic'd and spatial), FCP7 XML and OTIO timelines

Altspace/              Platform plugin: Altspace, through the altspace.js bot SDK
  adapter.mjs          altspace.js room client → core source
  codec.mjs            Altspace bone poses → skeletons, for the studio
  record.mjs           CLI: record a live world, or a mock scenario
  studio.mjs           CLI: studio export of a recording
  mock/                offline stand-in for an Altspace room, playing scripted scenarios with faults
  test/                golden harness, crash test, studio export test

ENGAGE/                Platform plugin: ENGAGE (import only, for now)
  tools/               .myrec decoder and inspector
  docs/                format notes

editors/               Video-editor plugins, which consume studio exports
  Premiere/            UXP panel: import, switch angle at playhead, jump to speech, send edits back
  Resolve/             (planned)

CSP/                   Local Magnopus Connected Spaces Platform setup (git-ignored)
IPN/                   Platform plugin: CSP recorder code (planned; versioned here, not in CSP/)
```

The rules that keep it pluggable:
- **`core/` never imports a platform SDK.** A platform plugin wraps its room API as a *source* ([core/source.mjs](core/source.mjs)), and core records any source the same way.
- **Platform data passes through untouched.** Avatar appearance and bone encodings are stored with the source's name for them (`session.json` → `source.boneCodec`). The studio decodes them through the plugin's codec, so core needs no knowledge of them.
- **Each plugin owns its own dependencies,** in its own `package.json`. Core has none.
- **Editors only read studio exports.** They never talk to a platform.

## Quick start

```bash
cd Altspace && npm install && npm test        # record every mock scenario and check it against its script
npm run studio -- recordings/demo-campfire    # render cameras, program, mixes, sequence.xml
```

Then in Premiere, install the panel ([editors/Premiere/README.md](editors/Premiere/README.md)), open `Altspace/recordings/demo-campfire`, and click **Import timeline into project**.

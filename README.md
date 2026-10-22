# XR Time Machine

Record social VR sessions as data rather than video: every avatar's motion, every voice on its own track, and the events. Then replay them, edit them like footage with cameras placed after the fact, and hand the result to Premiere or Resolve. Open source.

The research and roadmap are in [PLAN.md](PLAN.md), and the camera and audio wishlist for the editor is in [docs/studio-wishlist.md](docs/studio-wishlist.md).

## Plugin architecture

```
core/                  Platform-agnostic, no dependencies
  recorder.mjs         records any source to the recording format
  source.mjs           the contract a platform plugin implements
  clock.mjs            wall clock, or a virtual clock for instant deterministic runs
  audio.mjs            PCM helpers and WAV writing

Altspace/              Platform plugin: Altspace, through the altspace.js bot SDK
  adapter.mjs          altspace.js room client → core source
  record.mjs           CLI: record a live world, or the mock
  mock/                offline stand-in for an Altspace room, playing a scripted scene
  test/                golden harness: recorder output vs the scene, line by line
  bots/                setup checks and a first bot

ENGAGE/                Platform plugin: ENGAGE (import only, for now)
  tools/               .myrec decoder and inspector
  docs/                format notes

editors/               Video-editor plugins, which consume recordings
  Premiere/
  Resolve/
```

The rules that keep it pluggable:
- **`core/` never imports a platform SDK.** A platform plugin wraps its room API as a *source* ([core/source.mjs](core/source.mjs)), and core records any source the same way.
- **Platform data passes through untouched.** Avatar appearance and bone encodings are stored with the source's name for them (`session.json` → `source.boneCodec`), so nothing is lost and core needs no knowledge of them.
- **Each plugin owns its own dependencies,** in its own `package.json`. Core has none.
- **Editors only read recordings.** They never talk to a platform.

Adding a platform means writing one adapter like [Altspace/adapter.mjs](Altspace/adapter.mjs). Adding an editor means reading the recording format.

## Quick start

```bash
cd Altspace && npm install && npm test
```

This runs the golden harness against the mock Altspace room, offline. See [Altspace/README.md](Altspace/README.md) for live recording and setup.

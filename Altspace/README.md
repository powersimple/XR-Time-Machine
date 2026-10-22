# Altspace plugin

Records Altspace worlds through the altspace.js bot SDK. [adapter.mjs](adapter.mjs) turns a room client, live or mock, into a [core source](../core/source.mjs). The core recorder does the rest.

## Setup

Node 22.12+, then `npm install`, then copy `.env.example` to `.env` and add your client id. `npm run check` confirms everything is in place. `scripts/fetch-reference-docs.sh` downloads the Altspace SDK docs into `reference/` (git ignores them, since they're SideQuest's).

## Iterate offline against the mock room

[mock/](mock/) holds a fake altspace.js room client playing a scripted 10-second scene. Three people, Ava, Ben and Cy, stand at a campfire and take turns talking:

- Cy joins a second late and walks a few steps towards the fire.
- Ava and Ben laugh over each other at the end.
- Listeners turn to face whoever is speaking.

The mock uses the SDK's real types, rig and bone-pose codec, so the same adapter and recorder run on it and on a live room.

```bash
npm test                                  # golden harness, instant then real-time
npm run harness                           # instant: record on a virtual clock, compare exactly
npm run harness -- --realtime             # real time: 10 s on wall clock, timing-tolerant
npm run harness -- --compare <dir>        # re-check an existing recording
npm run record:mock                       # just record the mock scene
```

The harness in [test/](test/) works out from the scene alone what a perfect recorder would write. It then compares the output line by line:

- Every `poses.jsonl` line must equal the scene at some moment within its publish window, to about 1 mm and 0.5°.
- Every event must match a scripted join or speech turn.
- Every voice stem must match the scene's audio sample for sample.

Each mismatch is listed by file and line in `harness-report.txt` in the recording folder. Real-time runs measure event-loop stalls and only excuse gaps that a measured stall explains.

The scene is defined in [mock/scene.mjs](mock/scene.mjs). Change its characters, lines and movement to test other cases.

## Live

```bash
npm run record -- altspacecampfire --seconds 30
```

This joins as a guest recorder bot. Use it sparingly: the mock exists so we don't need to hit the real server while iterating. Recordings go to `recordings/`, which git ignores.

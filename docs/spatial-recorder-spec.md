# Altspace spatial recorder: working spec

This is the living spec. It combines the decisions so far, from [recorder-answers-and-open-questions.md](recorder-answers-and-open-questions.md) and Ben's answers of 27 October 2026. It becomes the build instructions for SideQuest once the prototype in The Polys world proves it out.

## What it records
- **Every avatar's position and full body pose,** in world coordinates relative to the world's 0,0,0. The recorder is omniscient; nothing is relative to the recording user.
- **Every voice, as its own mono track.** It's placed spatially at playback from the speaker's recorded head position. To start with, it uses Opus at the live 32 kbps, ideally the original packets, with no re-encoding.
- **Each persona as it was:** avatar, configuration and bake, with changes during the session.
- **Events:**
  - joins and leaves
  - mute and raised hand
  - emojis and reactions, as far as the app exposes them today
  - chapter markers
- **Synced objects and room state.** 3D assets are stored by reference to their cloud location, never copied in.
- **Not recorded:** lip sync and blinking. The app generates them during playback from the voice and motion, as it does live.
- **No MP4.** Video recording is suspended; video is made later, in post, from the spatial recording.

## Time
- Real start and end times in UTC go in the metadata.
- One recording clock runs from zero, with timecode that Premiere and Resolve understand.
- If Altspace has no room clock, request one. Syncing several recordings to each other isn't needed.

## Recording
- **Who:** world roles. World owners and admins first, moderators next.
- **Control:** a recorder spoke on the A Menu, with a big red record button that toggles to stop, and the device's recording library below it.
- **One recorder at a time** for now. Several at once comes later.
- **Notice:**
  - Everyone gets a short animated notice: "This session is being recorded by [user]".
  - It shows when recording starts and to everyone who arrives during a recording.
  - There's no opt-out; people may leave.
- **Stopping and blocking:**
  - Owners, admins and moderators can turn recording off for an event session, or for the whole world if that can be a setting.
  - A moderator can't stop a recording made by someone with permission. Owners and admins can.
- **Performance:**
  - Zero cost to the world and to other users. The recording device carries it.
  - Minimal memory: stream straight to storage, with nothing accumulating.
- **Storage:**
  - Up to the device's capacity.
  - Warn the user when less than 3 GB is free.
  - Local only for now. Cloud storage comes later.
  - Recordings are `.xrtm` files in their own visible folder on every OS, starting with Windows and Android/Quest. Each OS defines its own root, so new platforms slot in.
  - Playback reads from that local folder.

## Library
- Rename, delete, play.
- Export format to be designed with care: we're inventing a format. Cross-platform playback is a much later phase, but nothing done now may rule it out or create technical debt.

## Sharing (published recordings)
- **Two places for a recording:**
  - the private **local library** on the device
  - **published to a world**, where anyone who spawns can play it (a docent tour, like Arrival.space's "voicey")
- **Publishing** uploads the `.xrtm` to cloud storage tied to the world: today, the world's files (owner only, public to read, 50 MB per file) or the account's uploads.
- **Shared playback** has each visitor's device download the same file and play it locally, kept in step through space state. Nobody streams the recording over the network, which keeps the zero-footprint rule.
- **Size:** a one-person docent hour is about 40 MB (voice about 15 MB, full-body pose about 25 MB). Longer recordings are split into parts.

## Playback
- **Everyone in the world sees it,** including during a live session. That's the point.
- **People appear as they were.** Later features: remove avatars, change clothes, use their current avatar, or modify them.
- **Two modes:**
  - In original location (default).
  - As an object you can move and scale, from diorama to giant.
- **Recorded elsewhere:** if a recording was made in another world, offer to travel there and load it on arrival.
- **Changed world:** if the world has been edited since the recording, warn, then play anyway.
- **Missing assets:**
  - Playback skips them silently: no error, no glitch, as if they were never there.
  - Errors are logged quietly.
  - The library flags missing assets and lets the user re-path or delete them.
- **Nesting:** a playback can be recorded, or a live session with a diorama in it, but only one level deep.
- **Controls:**
  - a scrub slider
  - an hh:mm:ss jump field
  - chapter markers, each with its own sub-scrollbar
- **Cameras** are for playback only, and later.

## Workflow
- The Polys world is the sandbox.
- Develop on the Mac, push to git, then pull on Windows to build in Unity and test. The Mac is too slow for Unity.
- Test on Windows desktop and on Quest.

## Still open
- **SideQuest:**
  - A test world, a staging server, and a test build of the in-app recorder for world owners and admins.
  - Full-rate updates for a recorder (see note 1).
  - The original Opus packets with timestamps.
  - How emojis and reactions are sent.
  - A room clock.
  - A dedicated folder on Quest (see note 3).
- **Ben:**
  - Where The Polys world's Altspace Unity project lives (a git repo to clone).

## Notes
1. **"Full rate".** To save bandwidth, the server sends updates less often for avatars that are far from you. A recorder built into the app is just another client, so it would get distant people's movement at a lower rate, and the recording would look jerky for them. The ask to SideQuest is that a recording client receive everyone at full rate.
2. **The capture badge.** Altspace already has a badge that shows LIVE on someone's nametag while they capture. It's the `cam` value in user state. The question was whether to show that on the recording user's nametag as well as our animated notice. Suggestion: the notice alone, for now.
3. **Quest storage.**
   - **The world-script prototype** can only use the app's built-in browser storage (IndexedDB). It's private to the app and not a folder you can browse. It's still the device's storage, and its free space can be read (`navigator.storage.estimate()`), which covers the 3 GB warning (to verify on Quest).
   - **A real folder,** such as `Movies/Spatial Recordings` beside where the app already saves MP4s, needs the app itself, so that's a SideQuest item.

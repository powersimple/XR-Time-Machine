# Spatial recorder prototype in The Polys world

**Goal:** a working recorder that Ben, as owner of The Polys world, can switch on and test on desktop and headset, recording to the device. What we learn becomes the build instructions for SideQuest to add it to the Altspace app for everyone.

Everything below comes from the Creator SDK docs mirrored in `Altspace/reference/creator-sdk/`. Items marked **(verify)** aren't documented and need a test on a device.

## What a world script can and can't see

A world's own scripts (JavaScript on the space's page, or Visual Scripting graphs) run on every player's device.

| Needed for the recording | From a world script | Notes |
|---|---|---|
| Who's here, joins and leaves | **yes** | `user-joined`, `user-left` |
| Each person's persona (avatar, configuration, bake), mute, raised hand | **yes** | user state, with change events |
| Each person's **head** position and rotation, in world space | **yes** | the Get User State node reads any user's head (verify the rate, and whether JavaScript can read it) |
| Hands | only your own | `pose-update` covers the local player only |
| **Full body pose (52 bones) of other people** | **no** | only the app or the bot SDK sees it |
| **Each person's voice, as its own track** | **no** | only the app or the bot SDK. `BS.Recording` captures a mixed MP4, which we don't want |
| Synced 3D objects, room state, program cuts | **yes** | it's the world's own scene |
| Emojis and reactions | **unknown** | not in the docs |
| Saving to the device | **yes, with limits** | the page is real Chromium. `localStorage` is documented; IndexedDB should work, which allows hundreds of MB (verify on Quest) |
| Writing to a file you can pick up on a PC | **not directly** | world files upload to the world's public address (owner only, 50 MB per file), so they aren't private (see Q-P4) |

**So a world-script prototype can capture the whole session except full bodies and separate voices.** Those two are what only the app can do. That's the clearest possible list of what SideQuest has to build.

## The prototype: two layers

### Layer 1: in-world recorder (The Polys Unity build)
Runs on Windows desktop and on Quest. Ben's Mac can build and publish, but the Altspace app itself only runs on Windows and Quest.

- **Owner-only control.**
  - A small record panel, standing in for the future A Menu spoke.
  - It appears only for the world owner: `BS.PersistFileBridge.info()` reports `canWrite` only for the owner, and `isSpaceAdmin` is also available.
  - A big red button toggles to stop. Below it is the list of recordings on this device.
  - It's opened with a key on desktop or a wrist button in a headset (see Q-P2).
- **Recording state for everyone.**
  - Starting writes a protected space-state key, `xrtm.recording = { by, startedUtc }`. Only the owner or moderators can write it, which enforces the permission for us.
  - Every player's copy of the world script watches that key and shows the animated "This session is being recorded by Ben" notice, both when recording starts and when someone arrives during a recording.
  - Several recorders can each add their own entry.
- **Capture** at 30 samples a second, streamed to IndexedDB in small chunks:
  - each person's head pose
  - persona and state changes
  - joins and leaves
  - synced objects
  - chapter markers

  Everything is in world coordinates on one clock from zero, with UTC start and end. Memory stays flat: nothing accumulates, and each chunk is written and released.
- **Playback** (in-world, for testing the experience):
  - **In original location** (default): stand-in figures, a head and nametag per person, move as recorded.
  - **As an object:** the same figures under one root you can move and scale, from tabletop to giant.
  - A scrub slider, an hh:mm:ss jump field, and chapters with their own sub-scrollbar.
- **Footprint:**
  - The recorder sends nothing extra over the network, apart from the one space-state key.
  - The cost lands only on the recording device.
  - We measure it in the SDK's performance tools.

### Layer 2: full bodies and voices, through our existing bot
- The recorder bot already captures all 52 bones and each voice as its own track.
- For the prototype it runs on a computer. It watches the same `xrtm.recording` key, so Ben's in-world button starts and stops it too.
- Both layers share the UTC start, so they merge into one recording.
- The bot is visible and lives on the computer, not the headset. That's acceptable for testing, and it's exactly the part the SideQuest version replaces.

### What SideQuest gets
A build spec written from the working prototype:
- the recording format
- the capture list (Layer 1 plus Layer 2)
- the A Menu spoke and panel
- the notice
- permissions (admins and world owners, then moderators)
- the memory and storage rules
- Opus packet capture
- playback modes, including a full-body persona replay in the app

Our studio and the Premiere and Resolve export read the same format.

## Build steps
1. **Set up:**
   - Unity 6000.3.21f1 with the Creator SDK
   - The Polys world project
   - A test publish
2. **Recording and notice:**
   - The owner panel and the space-state key.
   - The notice for every player.
   - Check on Windows and Quest.
3. **Capture and storage:**
   - Head poses, persona and events, written to IndexedDB.
   - Measure memory, storage use and frame rate over an hour.
4. **The device library:** the list in the panel, with rename, delete and export.
5. **Playback:**
   - in original location
   - as a diorama
   - the scrubber, time jump and chapters
6. **Layer 2:** the bot follows the key, and the two layers merge.
7. **The SideQuest spec.**

## Questions for Ben, to start
- **Q-P1. The Polys Unity project.** Is The Polys world already built with the Creator SDK? Where is the project? I couldn't find it on this Mac. Or do we start a new one?
- **Q-P2. A device to test on.** Do you have a Windows PC and a Quest for testing? The Altspace app doesn't run on macOS. Is a key for desktop plus a wrist button in the headset OK for the trigger?
- **Q-P3. Unity on this Mac.** Unity 6000.3.21f1 needs installing here (about 10 GB). OK to install, or is there a better machine?
- **Q-P4. Getting recordings off the device.** IndexedDB keeps them on the device. To get one to a computer for Premiere, the options are:
  - upload to your own private server
  - the world-files store (public, so only for test sessions)
  - Windows only: a small local helper app

  Which would you like?
- **Q-P5. The Polys as a sandbox.** Is it fine for visitors to see the notice during tests, or should we use a private instance while testing?

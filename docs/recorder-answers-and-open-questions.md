# Spatial recorder: answers, gaps and new questions

Follow-up to [questions-for-shane.md](questions-for-shane.md). Part 1 lists what the answers decided. Part 2 answers the questions they raised for us. Part 3 lists what's still open.

## 1. What's decided

- **Scope.** Record a world as data: every avatar's position, body pose, voice and persona, plus 3D objects, animations and events such as emojis. Everything goes on one clock, so the scene can be reproduced spatially. Cameras, multicam and orbits come later, in playback only.
- **World origin, not viewpoint.** The recorder is omniscient and records everything relative to the world's 0,0,0, never relative to the recorder's own position.
- **Zero footprint on the world.** The recording user's device carries all the cost. It streams straight to local storage in real time, holds almost nothing in RAM, and memory doesn't grow over a session. Nobody else's experience degrades.
- **No video during spatial capture.** MP4 recording is off by default and only allowed in specific cases.
- **Invisible recorder, with a notice.** Anyone who arrives, or is present when recording starts, sees a short animated notice: "This session is being recorded by [user]". There's no opt-out; people may leave.
- **Several recorders at once.** Recorders don't take a seat. Any number of permitted users can record to their own devices at the same time.
- **Who can record.** Admins and world owners first, then moderators.
- **Interface.**
  - A recorder-icon spoke on the A Menu opens a panel.
  - A big red record button toggles to stop.
  - Below it is the list of spatial recordings on this device.
  - Settings can come later.
- **Playback** recreates the people as their real Altspace personas with their full configuration, not as exported models. It has two modes:
  - **In original location** (default): replays sound, motion and events exactly as they happened. If you're in a different world, it offers to take you to the original and loads on arrival.
  - **As an object:** a movable, scalable diorama, from tabletop miniature to giant.
- **Timeline.**
  - Real start and end times in UTC go in the metadata.
  - One recording clock places everything relative to the start, like layers on a video timeline, with timing that Premiere and Resolve understand.
  - The operator gets a scrub slider and an hh:mm:ss entry to jump precisely.
  - Chapter markers, each with its own sub-scrollbar as in Hyperscale.
- **Audio.** Mono per voice, compressed, clean and undistorted; not WAV. In playback, voices are either spatial, with adjustable distance falloff, or fully audible across the room.
- **Deferred:**
  - exporting worlds or avatars
  - capturing a world "as it was" (Altspace has one version per world, and worlds change)
  - fancy camera work

## 2. Answers to your questions

### Audio formats: options and recommendation
Every voice reaches us as **Opus**, Altspace's voice codec, at 32 kbps, or 16 kbps in rooms with 48 or more speakers. No format can be cleaner than what people heard live, so the aim is not to lose anything on top of that.

| Format | Size per voice per hour | Quality vs what people heard | CPU while recording | Editor support |
|---|---|---|---|---|
| **Opus, original packets kept (recommended)** | about 15 MB | identical: no re-encoding | almost none | converted on export |
| Opus, re-encoded at 64 kbps | about 29 MB | very slightly lower (a second pass) | low | converted on export |
| AAC-LC 96 kbps | about 43 MB | slightly lower | moderate | native in Premiere and Resolve |
| FLAC | about 100–150 MB | lossless after decoding | moderate | Resolve yes, Premiere no |
| WAV (what we use now) | about 345 MB | lossless after decoding | none | native |

**Recommendation: keep the original Opus packets.**
- It's bit-for-bit what the room heard, with no added loss, distortion or CPU cost.
- It's about 23 times smaller than WAV.
- When exporting to Premiere or Resolve, we decode to clean 48 kHz WAV or AAC. Big files only exist at edit time.
- **Catch:** the bot SDK only hands us decoded audio. Keeping the packets needs either the in-client recorder or a small SDK addition (see question C3). Until then, the bot can encode to Opus at 64 kbps, which is very close.

### "Is the spatial audio / room voice part running yet?"
Partly, and only outside Altspace:
- **Running:** the recorder captures every voice as its own clean track. This is verified in our virtual test rooms, and the bot has joined a live world (Campfire). We haven't made a real recorded session in a live world yet.
- **Running offline:** our export step makes a "mic'd" mix, where everyone is clean and present, and a "spatial" mix placed from a camera. That's close to your two playback modes, but it's done when rendering video, not live in Altspace.
- **Not built:** live spatial playback inside Altspace, with a distance setting or full-room audio. That needs playback in the client.

### "What does the application expose in terms of time and space?"
**Space:**
- Positions and body poses come in **world coordinates**: the hips' world position and rotation, then each bone relative to its parent.
- So the recording is already relative to the world's 0,0,0, as you want.
- Our earlier question was only about whether the server thins out updates for people far from the bot. The answer "everything is recorded in full" settles what we need. We still need to confirm the server does that for a bot, or have the client do it (see C1).

**Time:**
- **There's no room clock in the SDK.**
- Each movement update carries the sender's own capture time, on their own clock.
- Raised hands use real-world Unix time.
- Audio frames carry no time at all; we place them by when they arrive.

**Our plan for the timeline:**
- Store the real UTC start and end.
- Run one recording clock from zero.
- Write SMPTE timecode at 30 fps in the metadata and in the exported sequence, so Premiere and Resolve line everything up.
- Chapters become editor markers.

### Pose and avatar data: what we have and what's missing
| Data | Available to a recorder today? | Recording it? |
|---|---|---|
| Position and rotation of each person (world space) | yes, up to 30 per second | yes |
| Full body pose: 52 bones, accurate to about 0.1° | yes | yes |
| Persona: avatar, configuration and bake (the full look), nametag image, name | yes, from user state | at join only; mid-session changes **not yet** |
| Mute, raised hand, capture badge | yes, from user state | **not yet** |
| Voice per person | yes, as decoded audio | yes (as WAV, to change) |
| Who joined, left and spoke, and when | yes | yes |
| Synced 3D objects and room state | yes, if synced by the world | **not yet** |
| **Emojis and reactions** | **not in the SDK docs** | **no** (see C4) |
| Lip sync, blinking, finger and leg animation | no: each viewer's app makes these locally | no need if playback runs in the app, which recreates them from the recorded voice and motion |
| World-script animations that aren't synced | no: they only run locally | no (see C5) |
| Video playing on in-world screens | not exposed | no |

**Next step on our side:** record every user-state change and every synced object over time, so a persona can change its look mid-session and still play back correctly.

## 3. Ambiguities and new questions

### The big one
**A. Who builds the in-app parts?** Most of the plan runs inside the Altspace app:
- the A Menu spoke and recorder panel
- the arrival notice
- recording on the user's own device
- playback with real personas
- the diorama mode and "take me there"

That's SideQuest's Unity client. We only have the bot SDK and can't change the app. Options:
- SideQuest builds the client side to our recording format and spec.
- We get access to the client code or a plugin API.
- A mix: we write the format, spec, recording library and studio; SideQuest wires it into the app.

Which is it?

**B. What happens to our bot?** The bot runs on a separate computer, so it puts no load on any user's device. But it is a visible participant, it announces itself, and it has no menu. Should it:
- be our test and prototype recorder until the in-app recorder exists, or
- be dropped?

### New questions
- **C1. Full detail for every recorder.** Does the server send every person's motion at full rate to a recorder, wherever they are? Or must the in-app recorder ask for it? Full-rate receiving costs the server a little bandwidth per recorder. Is that within "zero footprint"?
- **C2. Room clock.** Can the app or server provide a shared room time? With several recorders in one session, it would let their recordings line up exactly, and let us place voice frames without guessing.
- **C3. Original voice packets.** Can the app (or the SDK) give the recorder each voice's original Opus packets with timestamps? This is what makes "small and clean" free.
- **C4. Emojis and reactions.** How are they sent? Are they events in the room, user state, or local only? Same question for any other "event effects" you want replayed.
- **C5. Animations and 3D assets.** Is recording synced objects and room state enough? Or do world-script animations that run locally also need capturing, which would need help from the world script?
- **C6. The notice.**
  - Is it the existing capture badge (the `cam` user state, which shows LIVE) plus a new animated toast, or something new?
  - Does a user who arrives mid-recording see it once per recording, or once per arrival?
  - With two recorders, does it name both?
- **C7. Playback visibility.**
  - Is "in original location" playback seen only by the operator, or by everyone in the world?
  - Can it run while a live session is going on?
  - Can a playback be recorded?
- **C8. Ghost voices and personas.** Do played-back people look exactly like live people (nametags, mute icons), or marked as replay, e.g. translucent or labelled "recorded"?
- **C9. Recording a playback, or a live session with a diorama in it.** Nested recordings: allowed, or blocked for now?
- **C10. The device library.**
  - Is it per device only, or also synced or shared, e.g. to the user's account or a world owner?
  - Can recordings be renamed, deleted, or exported to a computer for Premiere and Resolve?
  - On Quest, where do the files live, and how big can they get?
- **C11. Permissions.**
  - Is "admin, world owner, moderator" the world's own roles, or Altspace-wide staff roles?
  - Can a world owner turn recording off for their world?
  - Can a moderator stop someone else's recording?
- **C12. Quest limits.** What storage and memory budget can a recorder use on Quest without hurting frame rate? We'd set a hard cap, e.g. a few MB of RAM, and record straight to storage.
- **C13. MP4 "certain circumstances".** Which circumstances, and who turns it on?
- **C14. A world that changed.** If a recording plays in a world that has been edited since, do we play anyway (people may walk through new walls) or warn?
- **C15. Testing.** Until the in-app recorder exists, we can test with:
  - our virtual rooms
  - the bot in a test world you set up
  - the Windows app's MCP mode on a Windows PC

  Can SideQuest give us a test world and a staging server? Can admins and world owners turn on a test build of the in-app recorder?

### A possible shortcut for playback, without app changes
A playback can be acted out by **bots**: one bot per recorded person, each wearing that person's exact persona (avatar, configuration and bake), replaying their motion and pose and speaking their voice. That's real Altspace avatars, in the original location, today. Limits:
- each bot is a visible participant and counts as a peer
- no diorama scaling
- no private, operator-only playback

**Is this worth a prototype while the in-app version is decided?**

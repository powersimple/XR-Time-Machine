# Questions for Shane

Shane, here's our technical question list boiled down. Short answers are perfect, and "ask so-and-so" is a great answer too.

**1. Does a recorder bot receive everyone in full detail?** Our bot listens but never moves, so it has no position in the room. Does it still get every person's movement at the full 30 frames a second and every voice, however far away they are and however big the room? If not, is there an observer mode that would?

**2. Can we line up movement and voice exactly?** Is there a room clock, or timestamps on movement and voice packets, so we can place them precisely instead of by when they arrive? And when someone mutes, does their audio stop or turn to silence?

**3. Avatars**
- a. Can we get avatars as standard 3D files (glTF), through an export, a converter, or a download of the baked avatar?
- b. How should we read the pose data?
  - Are bone rotations relative to the parent bone?
  - Is the root at the feet or about 5 cm above them?
  - Which way is forward?
  - When is avatar scale applied?
  - Which bones are actually sent?
- c. What does the app animate on its own that isn't sent over the network (lip sync, blinking, hands, walking), and roughly how?

**4. Can a world's geometry and lighting be exported in an open format** (glTF, USD or FBX) so renders show the real world, not an empty grid?

**5. Could the Altspace app render our recordings?** For example, a headless "replay player" build that renders frames along camera paths we supply. Longer term, could the app save this movement and voice data alongside its existing MP4 recording, or play recordings back as ghosts in a world?

**6. What rules should the recorder enforce?**
- a. Is a visible, named bot enough notice, or can a bot show the same "recording" badge that in-world recording shows?
- b. Is there, or could there be, a per-person "don't record me" setting and a per-world "recording allowed" setting that the bot can read and obey?

**7. How should recorders connect?**
- a. Should they join as guests or as signed-in bot accounts, and what are the limits on joins and on simultaneous bots?
- b. Does a recorder take up a seat in the room's capacity? Is there a test environment we can use instead of live worlds, and how do we hear about SDK changes before they break us?

---

<sub>For Ben: these cover the detailed files in `questions-for-altspace/`. 1 = NT-01 to 03, VA-01 · 2 = NT-04, NT-11, VA-02, VA-03 · 3 = AV-01 to 04, AV-08 to 12, AV-15 to 19 · 4 = WO-01 · 5 = CL-01, CL-04, CL-05, CL-07 · 6 = RP-02 to 04, WO-06 · 7 = AI-01, AI-02, AI-04, AI-05, NT-06, NT-07, NT-12. The business questions (product and partnership) and the finer points are left out.</sub>

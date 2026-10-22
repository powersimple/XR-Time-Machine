# Spatial Studio wishlist

Ben's notes from 2026-10-21, as written, with how each would work.

| Ben's note | What it means in Studio |
|---|---|
| any number cameras | Unlimited virtual cameras per project. Cameras are data rather than renders, so adding one costs nothing until it's rendered. |
| Directionally and positionally fixed | Static cameras: set position, rotation, FOV and lens. Also cameras locked to a world anchor, such as a stage or podium. |
| Camera tracking follow modes | A camera follows a target (an avatar's head, an object or a group centroid). Modes: **look-at** (position fixed, aims at the target), **follow** (keeps an offset from the target), **orbit**, **over-the-shoulder**, **dolly on a path**. |
| Smooth motion, easing | Every camera move goes through damping and easing: spring follow, lag and dead-zone settings, and keyframe curves (ease in/out, bezier). The recorded motion stays untouched; smoothing applies only to the camera. |
| Works like a multicam | Every camera plays in sync, in a grid of angles as in Premiere and Resolve multicam. Clicking an angle cuts to it. Each camera is one angle of a multicam clip. |
| Choose which are active at different [times] | A program track of camera switches: each switch is an OTIO clip that points at a camera ID. Cuts can be edited after the fact. |
| with transition effects | Cut, dissolve and dip-to-black, plus **camera blends**: an interpolated move from camera A to B, which only a virtual set allows. |
| can be automated by who is speaking | An **auto-director** that cuts to the camera assigned to whoever is speaking, using the separate per-speaker audio tracks. Settings: minimum shot length, hold time, a wide shot when several people talk at once, and a reaction-shot chance. The result is an editable cut list, not baked video. |
| Two modes per character: mic'd vs spatial | Per participant: **mic'd** uses their dry voice track at a constant level, like a lavalier mic. **Spatial** renders their voice from their position, heard from the active camera, so it changes with distance and direction. Each person can be switched per clip, with a blend between the two. Output both stems so the NLE can remix. |

Data-model impact:
- The recording must store **per-speaker voice tracks**, never only a mix.
- **Cameras and the program track live in the OTIO sidecar**, with camera settings in clip metadata.
- Spatial audio rendering needs positions for each speaker's head over time, which the pose channels already provide.

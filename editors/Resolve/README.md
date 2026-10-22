# DaVinci Resolve plugin (planned)

Nothing is built yet. This is the plan from the October 2026 research (see [PLAN.md](../../PLAN.md)).

**First version: interchange, which works in the free edition.**
- Spatial Studio writes an `.otioz` bundle: camera renders, per-speaker WAVs, and markers for events.
- Resolve imports OTIO, FCPXML and AAF.
- Edits come back as an OTIO export, mapped to the recording by clip name, source path and timecode. Custom OTIO metadata is likely dropped.

**Then a Workflow Integration panel** (an Electron app, plus Python):
- Resolve **Studio only**, since 21.1 moved external scripting, Workflow Integrations and UIManager to Studio.
- The panel embeds a camera picker and session browser, and drives import and re-render through the scripting API.

**Later, optional:** an OpenFX generator (works in free and Studio) that renders the scene with keyframable camera parameters. Or Fusion USD import, for light scenes.

**Not possible:** a native custom-format decoder. The public codec SDK is encode-only and Studio-only.

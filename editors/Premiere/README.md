# Premiere plugin (planned)

Nothing is built yet. This is the plan from the October 2026 research (see [PLAN.md](../../PLAN.md)).

**First version: interchange.** Premiere 26.x imports and exports OpenTimelineIO natively. Spatial Studio renders the chosen cameras (ProRes or EXR), writes one WAV per speaker, and hands over an `.otio` timeline.

**Then a UXP panel** (JavaScript; GA since 25.6; manifest v5, `minVersion` 26.2 or later):
- Import a recording's OTIO and build the sequence: `importFiles`, `createSequenceFromMedia`, and the `SequenceEditor` actions.
- Switch camera angles and request re-renders.
- Sync edits back with `ProjectConverter.exportAsOpenTimelineIO`.
- Store the recording and camera IDs in clip metadata or marker guids, so edits map back.

**Later, optional:** a C++ MediaCore importer (a recording as one clip with multichannel audio and frames rendered on demand), or a Hybrid UXP add-on.

**Avoid:** CEP and ExtendScript, which are past Adobe's support window. Pin UXP versions too: 26.3 already broke code by requiring `lockedAccess`.

# Questions for the Altspace team: XR Time Machine

**From:** Ben Erwin (XR Time Machine) · **Via:** Shane Harris · **October 2026**

XR Time Machine records Altspace sessions as data: every participant's root transform and bone poses, each voice on its own track, and join/leave/speech events. It then renders them from virtual cameras into editor-ready footage for Premiere and Resolve.

Recording works today through a bot built on **altspace.js 0.1.2**. To make the footage faithful and the feature a good citizen of Altspace, we need answers from several people on your team. The questions are split by topic so each file can go to whoever owns that area.

## The files

| File | Best owner | Questions |
|---|---|---|
| [avatars.md](avatars.md) | Avatar / character team | 22 |
| [networking-and-transforms.md](networking-and-transforms.md) | Networking / room server | 12 |
| [voice-and-audio.md](voice-and-audio.md) | Voice / audio | 10 |
| [worlds-and-objects.md](worlds-and-objects.md) | Worlds / Creator SDK | 9 |
| [client-integration.md](client-integration.md) | Unity client | 9 |
| [recording-policy-and-privacy.md](recording-policy-and-privacy.md) | Trust & safety | 8 |
| [accounts-infrastructure-and-sdk.md](accounts-infrastructure-and-sdk.md) | Platform / backend / SDK | 10 |
| [product-and-partnership.md](product-and-partnership.md) | Shane | 7 |

Every question has an **ID** (e.g. `AV-04`) and a **priority**:
- **P0** blocks the next milestone.
- **P1** is needed for quality.
- **P2** is longer term.

If you only have a few minutes, answer the P0s.

## How to answer

- **People:** reply in whatever form is easiest: a message, a call, or inline notes. One-line answers are fine, and "don't know, ask X" is a useful answer too.
- **AI assistants (e.g. your team's Claude):** each file ends with an **answer block**. Fill it in and return the whole block. Please:
  - Answer **only from code, documentation or people you can actually consult**. If you can't verify something, set `confidence: unknown` rather than guessing.
  - Put **file paths, class names, docs pages or Slack threads** in `sources`, so we can follow up without bothering anyone.
  - Note in `answer` anything that's **confidential or not for external use**, and leave it out of the reply.
  - Keep each `answer` short. Attach longer material (specs, sample files, screenshots) by listing it in `attachments`.
- **Returning:** send each completed answer block (or the whole file) back to Shane or Ben. The answer blocks can be merged automatically.

## Answer block format

```yaml
- id: AV-04                  # the question's ID
  answer: >                  # the answer, as short as it can be while complete
    ...
  confidence: confirmed      # confirmed | likely | unknown
  sources: []                # file paths, class or method names, doc links, people
  attachments: []            # files sent alongside (names), if any
  owner:                     # who answered, or who should
  follow_up:                 # anything you need from us, or a better person to ask
```

## What we provide in return

- **Sample recordings** from a live Altspace world and from our virtual test rooms.
- **Our renderer and test harness,** so you can see exactly how we use your data.
- **Rendered footage** for review.

Contact Ben through Shane.

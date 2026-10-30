# Recording policy, consent and privacy

**For:** trust & safety / community · **Answer block:** at the end · **How to answer:** see [README](README.md)

## Why we ask

Recording people as data, including each person's voice on its own track, is powerful and sensitive. We want consent built in from the first version, and aligned with how Altspace already treats bots and recording.

## What we already understand

- **Bots announce themselves** when they join. Worlds can turn away bots, AI agents and guests, and keep an "Allowed bots and AI agents" list. A world's owner, group managers and admins bypass those blocks.
- **`BS.Recording`:** a world script can start a recording on a player's device without asking them, but other players see a recording badge on whoever is recording.

## Our current plan, for your reaction

- The recorder is a **visible, named bot**, e.g. "Recorder (Event name)", and is only used where the world owner allows it.
- People can see that recording is on, and can **opt out of their voice track**, or of being recorded at all (their avatar is hidden in exports).
- Recordings are stored by whoever ran the recorder, not uploaded anywhere by default.

## Questions

- **RP-01 (P0)** Is recording sessions with a bot allowed under Altspace's terms? Under what conditions (world owner consent, notice to participants, events only)?
- **RP-02 (P0)** What notice should participants get? Is the bot nametag enough, or should there be a recording badge like `BS.Recording`'s? Can a bot show such a badge?
- **RP-03 (P0)** Is there, or could there be, a **per-user "don't record me" preference** that a recorder must honour (hide the avatar, drop the voice)? Where would it live (user state, account settings)?
- **RP-04 (P1)** Should worlds have an explicit "recording allowed" setting, separate from the bot settings?
- **RP-05 (P1)** Retention and deletion: how long may recordings be kept, and must a participant be able to ask for their data to be removed?
- **RP-06 (P1)** Minors and age gating: does `userHasVerifiedAge`-style information exist that a recorder should respect?
- **RP-07 (P2)** Moderation: if recorded content shows abuse, is there a way to report it with the recording attached?
- **RP-08 (P2)** Data location: any requirements on where recordings are stored or processed (EU users, etc.)?

## Answer block

```yaml
- { id: RP-01, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: RP-02, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: RP-03, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: RP-04, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: RP-05, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: RP-06, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: RP-07, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: RP-08, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
```

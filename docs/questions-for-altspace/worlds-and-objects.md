# Worlds and objects

**For:** worlds / Creator SDK · **Answer block:** at the end · **How to answer:** see [README](README.md)

## Why we ask

Renders currently show people on an empty grid. With the world itself (geometry, lighting, screens and props), the footage would look like the event. Replay inside Altspace also needs a world to play back in.

## What we already understand

- **The Creator SDK** (Unity) builds and publishes worlds, with JavaScript (`BS.*`) or Visual Scripting for interactivity.
- **`BS.Recording` and `BS.Newsroom`** already record MP4s on a player's device from camera feeds, textures or scene cameras, and run a multicam "program". Program state lives in the space-state key `newsroom.program`.
- **World pages** on altvr.app have "Who is turned away" settings (bots, AI agents, guests) and an "Allowed bots and AI agents" list.

## Questions

- **WO-01 (P0)** Can a world's geometry, materials and lighting be exported, or downloaded by a tool, in an open format (glTF, USD or FBX) for offline rendering? If only as a Unity bundle, what's in it?
- **WO-02 (P1)** Where's a world's coordinate origin and spawn layout? Is the floor at y = 0? Can a bot read spawn points and seat positions?
- **WO-03 (P1)** In-world screens and browsers (`BS.Browser`, feed monitors): can a recorder find out what they showed and when (URL, video timeline), to re-create them in renders?
- **WO-04 (P1)** Synced props and world state (object transforms, room state, `newsroom.program`): what can a bot read, and are changes timestamped?
- **WO-05 (P1)** Could a world script tell a recorder about **its own camera feeds** (`BSCameraFeed` positions and FOV, the program cut), so our virtual cameras match the world's cameras, or replace them?
- **WO-06 (P1)** Is there a supported way for a world to say "this world may be recorded" or "may not", beyond the bot settings? (See also [Recording policy and privacy](recording-policy-and-privacy.md).)
- **WO-07 (P2)** For replay in Altspace: could a world (or the client) load a recording and play it back as ghost avatars and voices, e.g. a "replay" component in the Creator SDK? What would that need?
- **WO-08 (P2)** Lighting and post-processing: is there a "neutral" setting renders should match, or per-world settings we can read?
- **WO-09 (P2)** Community spaces and unregistered spaces "let bots in". Do any rules apply to recording there?

## Answer block

```yaml
- { id: WO-01, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: WO-02, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: WO-03, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: WO-04, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: WO-05, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: WO-06, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: WO-07, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: WO-08, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: WO-09, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
```

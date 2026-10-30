# Networking and transforms

**For:** networking / room server · **Answer block:** at the end · **How to answer:** see [README](README.md)

## Why we ask

A recorder bot joins a room, never publishes a body, and samples every peer's `root` transform view (`client.transforms.view(...).sample(...)`) and bone-pose extension at 30 Hz. We need to know whether what a bot receives is the full-fidelity motion other people see, and how to record without burdening the room.

## What we already understand (from altspace.js 0.1.2 docs)

- Avatars publish up to 30 Hz with the `social-avatar` rate-LOD preset, which thins frames for distant receivers. `primaryLodReference` sets which transform distances are measured from.
- `bypassLod` on a transform or voice is honoured by bots (0.1.1).
- `TransformView.sample(t, maxExtrapolationMs)` interpolates or extrapolates; `diagnostics` reports `deliveredHz`, `sequenceGaps`, `congestionLimited` and similar.
- A peer's `roomSessionId` survives a reconnect that gets the same session back; transforms and user state are keyed by it.

## Questions

### What a recorder receives
- **NT-01 (P0)** A bot that never publishes a transform has no position. How does rate-LOD treat it: does it receive every peer at full rate, at a reduced rate, or does it fall back to some default distance? Should a recorder publish a hidden reference transform (e.g. at the room centre) to get full rate?
- **NT-02 (P0)** Is there a supported way for a recorder to receive **every peer at full rate regardless of distance**? For example an observer or recorder role, or a server-side flag on its account.
- **NT-03 (P0)** Does the bone-pose extension arrive with every transform frame, or at its own rate? Is it thinned differently from the root?
- **NT-04 (P1)** For an exact replay, should we record the raw received frames (with sequence numbers and the sender's capture timestamps) rather than sampled values? Are capture timestamps on the sender's clock or a room clock, and how well synchronized are they?
- **NT-05 (P1)** What do `sample(t, maximumExtrapolationMs)` and its interpolation do exactly (buffering delay, extrapolation limits)? This matters for matching what viewers saw.

### Load, scale and behaviour
- **NT-06 (P0)** What does one receive-only bot cost the room server (bandwidth, CPU), roughly, for 20, 50 and 100 peers? Are there limits on how many bots a room or account may have?
- **NT-07 (P1)** Is a room's peer count visible to players, and does a bot count toward instance capacity (`space_full`)? Could a recorder take a seat a human needed?
- **NT-08 (P1)** Instances: if a world has several instances, does a recorder need one bot per instance? Can it see which instance a peer is in?
- **NT-09 (P1)** Reconnects: when a peer reconnects with the same `roomSessionId`, is it the same `peerId`? (We handle both.) What's the typical reconnect window?
- **NT-10 (P2)** Are synced objects (`kind: 'object'` transforms, room state) visible to a bot in full, so we can record props and world state?

### Clocks and stability
- **NT-11 (P1)** Is there a room or server clock a client can read, to timestamp recordings in room time?
- **NT-12 (P2)** How are protocol changes announced? (0.1.0 was refused by a server upgrade the day after release.) Is there a deprecation window or a compatibility policy for the room protocol?

## Answer block

```yaml
- { id: NT-01, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-02, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-03, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-04, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-05, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-06, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-07, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-08, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-09, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-10, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-11, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: NT-12, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
```

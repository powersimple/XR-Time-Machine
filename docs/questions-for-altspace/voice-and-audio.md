# Voice and audio

**For:** voice / audio · **Answer block:** at the end · **How to answer:** see [README](README.md)

## Why we ask

Each participant's voice is recorded as its own track, which is what makes speaker-driven camera cuts and "mic'd vs spatial" mixes possible. The recorder receives decoded PCM through `client.voice.onRemotePcmFrame` (`peerId`, `producerId`, 48 kHz, 10 ms frames). Frames carry no timestamps, so we place them on the timeline from arrival times, and handle bursts and mutes.

## What we already understand (from altspace.js 0.1.2 docs)

- Voice bitrate is 32 kbps normally and 16 kbps in dense rooms (at 48 or more publishers).
- Proximity reception is opt-in, entering at 20 m and leaving at 24 m. A client that hasn't reported a position receives every voice.
- `clearRemoteVoicePosition` and voice `bypassLod` exist.
- `createSpeakingDetector(client)` reports who is talking. Voices from Unity clients arrive quiet.

## Questions

- **VA-01 (P0)** Does a receive-only bot reliably receive **every** voice in the room, at any distance and room size? Any server-side voice LOD or caps beyond the client options above?
- **VA-02 (P0)** Can a client get **timing information** for remote audio, such as RTP timestamps, capture times or sequence numbers, through altspace.js or the underlying mediasoup consumer? That would let us place audio exactly instead of estimating from arrival.
- **VA-03 (P0)** When someone mutes, does their producer pause (frames stop) or send silence? Is mute state signalled separately (user state `muted`?) with a timestamp we can record?
- **VA-04 (P1)** When packets are lost, does the decoded PCM stream contain concealment (continuous 10 ms frames), or do frames go missing?
- **VA-05 (P1)** Can one peer have several voice producers (`producerId`), e.g. mic plus shared media audio? How do we tell a voice from other audio?
- **VA-06 (P1)** Is any processing applied before the network (noise suppression, AGC, echo cancellation)? Are Unity voices deliberately quiet, i.e. what's the normal level?
- **VA-07 (P1)** How does the client spatialize voices: the attenuation curve, min/max distance, panning model, HRTF? We'd like "spatial" mixes to sound like being in the room.
- **VA-08 (P1)** Are there non-voice audio sources in a world (videos, music, sound effects) that a recorder could capture as separate tracks?
- **VA-09 (P2)** Is any speech-to-text or speaking-state data available server-side, which would be useful for captions and chapters?
- **VA-10 (P2)** Can a recorder get higher-quality audio than the live voice bitrate (e.g. a "recording" bitrate), or is 32 kbps Opus the ceiling?

## Answer block

```yaml
- { id: VA-01, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: VA-02, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: VA-03, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: VA-04, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: VA-05, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: VA-06, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: VA-07, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: VA-08, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: VA-09, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: VA-10, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
```

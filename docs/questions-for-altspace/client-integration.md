# Unity client integration

**For:** Unity client · **Answer block:** at the end · **How to answer:** see [README](README.md)

## Why we ask

Recording through a bot works without any change to your client. Longer term, the client could record natively (exact timestamps, every bone, local effects) and play recordings back. Separately, the most faithful renders would come from your own client rendering offline. We'd like to know what's realistic.

## Questions

### Rendering with the real client
- **CL-01 (P0)** Is a **headless or offscreen "replay player"** build feasible? It would:
  - load a world and the recorded avatars (from their triples)
  - play a recording's timeline (root transforms, bone poses, user state)
  - render frames from camera paths we supply (position, rotation, FOV per frame) to image sequences or ProRes

  What would it take, and who could own it? We'd provide the recording reader and the camera paths.
- **CL-02 (P1)** Which Unity version and render pipeline does the client use (URP? which settings)? We need this to approximate the look in our own renderer meanwhile.
- **CL-03 (P1)** Does the Windows app's MCP server (or `-mcp` mode) offer anything useful for automated capture, such as taking snapshots from a scripted camera? Or is it strictly player-driven?

### Recording in the client
- **CL-04 (P1)** Would you consider a **native recorder** in the client (opt-in), writing the same kind of data our bot records? It could record what the client itself sees: exact frame timestamps, its own locally animated bones (lip sync, IK), and the world state.
- **CL-05 (P1)** `BS.Recording` already records MP4 on device. Could a recording also save the **data** (transforms, bone poses, per-speaker voice) alongside the MP4, so any MP4 can later be re-shot from other angles?
- **CL-06 (P2)** Host extensions: `scene.HostExtension(command, op, body)` reaches app features by name. Is this the intended way to add a feature like "start data recording" or "play recording", and can third parties propose new commands?

### Playback in the client
- **CL-07 (P2)** Could the client play back a recording as ghosts in a world, with scrubbing, for rehearsal, review or "being there" after the fact? What constraints would apply (avatar loading, number of ghosts, audio)?
- **CL-08 (P2)** On Quest, what are the limits for a playback feature (avatars, memory)?

### Process
- **CL-09 (P1)** How would you like to collaborate if any of this goes ahead: a shared repo, a design review, a contact person?

## Answer block

```yaml
- { id: CL-01, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: CL-02, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: CL-03, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: CL-04, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: CL-05, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: CL-06, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: CL-07, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: CL-08, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: CL-09, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
```

# Avatars

**For:** the avatar / character team · **Answer block:** at the end · **How to answer:** see [README](README.md)

## Why we ask

Our renderer draws participants from recorded data: the `root` transform, the bone-pose extension (codec 1201 v2) and the avatar triple in user state. Today they're stick figures. To look like Altspace we need the avatars themselves: how to get them, how they're skinned, and what the Unity client animates on top of the network stream.

## What we already understand (from altspace.js 0.1.2)

Please correct anything wrong.

- **Avatar triple:** `avatar` (descriptor `Male` / `Robot`), `avatarCfg` (e.g. the guest config `2|f=r|b=m|v=l|g=0.5`) and `avatarBake` (a `b1…` manifest).
- **Bake manifest:** `{ url, sha256, size, configHash, bakeVersion, level, fileId }`, with `RECEIVER_BAKE_VERSION = 16`. `isAllowedBakeUrl` limits hosts, and `AVATAR_BAKE_PLATFORM_KEY` suggests per-platform bakes.
- **Rigs:**
  - `human` is `Assets/Content/Altspace/Avatar/Human/Prefabs/AltspaceHuman.prefab`
  - `robot` is `…/Avatar/Robot/Robot.prefab`
  - each has 52 bones in `BONE_NAMES` order, with parents, rest transforms, `hipRestWorldPosition` and `soleOffset`
- **Bone pose:** 221 bytes per frame, decoding to `{ hipWorldPos, rotations[52] }`, with quaternions packed into 32 bits.
- **`ROOT_HEIGHT_ABOVE_FLOOR = 0.053`,** plus locomotion helpers (`AvatarMotion`, `LegPlanter`, `WALK_KEYFRAMES`, crouch constants).
- **Config helpers:** `HUMAN_SHAPES`, `POSTURE_SLIDERS`, `CosmeticCategories`, `AvatarSlots`, and `bakeIneligibility` (so some avatars have no bake).

## Questions

### Getting the avatar
- **AV-01 (P0)** What does a bake at `manifest.url` contain, and in what format: a Unity AssetBundle, glTF, or a custom pack (`PACK_FORMAT_VERSION`)?
- **AV-02 (P0)** Which platform variant of a bake suits offline rendering on a desktop machine, and what does `level` mean (LOD, quality tier)?
- **AV-03 (P0)** Does fetching a bake need authentication? Can a bot or server do it, and how?
- **AV-04 (P0)** Is there, or could there be, a path from a bake to **glTF 2.0 (`.glb`)**: a mesh skinned to the same 52 joints (named per `BONE_NAMES`), inverse bind matrices consistent with `loadRig`, PBR materials (or documented approximations of the URP shaders), textures, and morph targets? We'd take any of:
  - a conversion tool we can run headless
  - a server endpoint
  - a one-time export of the base bodies and every cosmetic piece
- **AV-05 (P1)** For avatars without a bake (`bakeIneligibility`), how does the client build the look from `avatarCfg`?
  - base body per family
  - mapping from cosmetic slot to mesh
  - colours
  - shape weights (`HUMAN_SHAPES`, `BODY_FEMALE_SHAPE`) as blendshapes or bone scales
  - posture sliders
- **AV-06 (P1)** What does the client show while a bake loads or if it fails (`BAKE_HEAD_TIMEOUT_MS`, `defaultBakeHead`)?
- **AV-07 (P1)** Robot / guest family: can we get it as `.glb` (mesh, skin, materials), with the glow (`ROBOT_GLOW`) parameters?

### Pose conventions
- **AV-08 (P0)** Are `rotations[i]` local to the parent bone (Unity `localRotation`)? Do consumers need `parentFrameRotation`?
- **AV-09 (P0)** Is `hipWorldPos` relative to the participant's `root` transform, and in metres, before or after any avatar scaling?
- **AV-10 (P0)** Is the `root` transform the feet on the floor, or offset by `ROOT_HEIGHT_ABOVE_FLOOR` (0.053 m)? Which way does an avatar face at identity rotation? We assume +Z forward, left on −X.
- **AV-11 (P0)** Is per-avatar scale (height, shapes) applied after the pose? Which field should a renderer read it from?
- **AV-12 (P0)** Which of the 52 bones does the stream actually carry, every frame, sometimes or never? Are fingers and toes ever sent?
- **AV-13 (P1)** What's the expected quantization error of the packed quaternions? Any special values (`IDENTITY_BITS`)?
- **AV-14 (P1)** How will changes to the bone-pose codec version be announced, and will v2 frames stay decodable?

### What the client adds locally (not in the stream)
- **AV-15 (P0)** Lip sync: is it driven by voice amplitude or visemes? Which blendshapes or bones, with what smoothing and thresholds? (We have each speaker's clean 48 kHz voice track and can reproduce it.)
- **AV-16 (P1)** Eyes: blink pattern, gaze target (the speaker? the camera?), saccades.
- **AV-17 (P1)** Hands and fingers: default poses, gesture or grip poses, and when they apply.
- **AV-18 (P1)** Legs and feet: is walking from root velocity, foot planting and IK done on the receiving client? Is it the same algorithm as altspace.js's `AvatarMotion` and `LegPlanter`?
- **AV-19 (P1)** Idle motion (breathing, sway), emotes, hand raise, and speaking indicators: what exists, and what drives each?

### Validation and look
- **AV-20 (P1)** Can you supply 3–5 reference avatars (a mix of humans and one robot)? For each we'd want:
  - the triple
  - the `.glb` (once AV-04 exists)
  - a few raw bone-pose frames
  - **Unity screenshots of those exact poses** from given camera settings

  These become the golden images our renderer must match.
- **AV-21 (P1)** The in-world style of name tags and indicators: font, colours, size, placement relative to the head, and when they show.
- **AV-22 (P2)** Performance: typical and maximum triangles and texture sizes per avatar, the LOD chain and switch distances, and advice for 20–50 avatars in one frame.

(A headless Unity renderer is in [Client integration](client-integration.md).)

## Answer block

```yaml
- { id: AV-01, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-02, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-03, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-04, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-05, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-06, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-07, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-08, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-09, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-10, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-11, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-12, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-13, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-14, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-15, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-16, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-17, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-18, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-19, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-20, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-21, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AV-22, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
```

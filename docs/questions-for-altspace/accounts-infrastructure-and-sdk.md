# Accounts, infrastructure and the SDK

**For:** platform / backend / SDK maintainers · **Answer block:** at the end · **How to answer:** see [README](README.md)

## Why we ask

Recorders will run unattended, sometimes for hours, sometimes several at once for big events. We want to run them the way you'd prefer, and to keep up with SDK changes.

## What we already understand

- **Every bot needs a client id** (`pp_client_…`). Bots join as guests, or sign in through a link approved by a dedicated bot account.
- **altspace.js comes from the Greenfield registry.** 0.1.0, 0.1.1 and 0.1.2 shipped within two days, and 0.1.0 stopped working when the room protocol moved on.

## Questions

- **AI-01 (P0)** Should production recorders run as **guests** or as **signed-in bot accounts**? Is one client id per deployment fine, or one per recorder?
- **AI-02 (P0)** **Rate and concurrency limits:** joins per minute, simultaneous bots per client id or account, API calls. What happens when they're exceeded?
- **AI-03 (P1)** **Long sessions:** any maximum session length, token expiry or forced reconnect we should plan for? (We handle reconnects, and a sign-in ending is `reauth`.)
- **AI-04 (P1)** Is there a **staging environment** (room servers, API) for testing recorders without touching production worlds? (`altspaceEnvironment` and the `ROOM_SERVER_ENV_KEYS` hint at one.)
- **AI-05 (P1)** **SDK releases:** is there a changelog feed or a mailing list for altspace.js and room protocol changes? Is there a policy for how long older SDK versions keep working?
- **AI-06 (P1)** Will altspace.js be published to the public npm registry, or stay on Greenfield? (It affects install instructions for anyone running a recorder.)
- **AI-07 (P1)** **WebRTC in Node:** `@roamhq/wrtc` 0.9.1 crashes in its finalizers when Node exits on its own, on macOS x64. We work around it with an explicit `process.exit()`. Known? Is a different addon planned?
- **AI-08 (P2)** **Server-side recording:** could the room server itself record (raw streams or session data) for world owners who ask, removing the need for a bot?
- **AI-09 (P2)** **Discovery:** could recorders find scheduled events (`EventsService`) and join automatically, with permission?
- **AI-10 (P2)** Is there a webhook or event when a world goes live or empties, so a recorder can start and stop automatically?

## Answer block

```yaml
- { id: AI-01, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AI-02, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AI-03, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AI-04, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AI-05, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AI-06, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AI-07, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AI-08, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AI-09, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
- { id: AI-10, answer: , confidence: , sources: [], attachments: [], owner: , follow_up:  }
```

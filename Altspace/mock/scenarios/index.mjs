// Every mock scenario, by name. Each one targets a way recording can go wrong; see the descriptions.

const circle = (n, radius, i) => [Math.round(radius * Math.sin((2 * Math.PI * i) / n) * 100) / 100, 0, Math.round(radius * Math.cos((2 * Math.PI * i) / n) * 100) / 100];

export const campfire = {
  name: 'campfire',
  description: 'Three people talk in turns; one joins late and walks; two laugh over each other.',
  durationMs: 10_000,
  characters: [
    { id: 'ava', displayName: 'Ava', userId: 'sq:1001', pitchHz: 210, position: [-1.2, 0, 1.0] },
    { id: 'ben', displayName: 'Ben', userId: 'sq:1002', pitchHz: 115, position: [1.2, 0, 1.0] },
    { id: 'cy', displayName: 'Cy', userId: 'guest:3003', pitchHz: 160, position: [0, 0, -1.6], sessions: [{ joinMs: 1_000 }], walks: [{ fromMs: 6_000, toMs: 7_500, to: [0, 0, -0.9] }] },
  ],
  lines: [
    { speaker: 'ava', startMs: 300, endMs: 3_000, text: 'Welcome to the campfire, everyone.' },
    { speaker: 'ben', startMs: 3_300, endMs: 6_000, text: 'Thanks Ava. Cy, you made it!' },
    { speaker: 'cy', startMs: 6_200, endMs: 8_400, text: 'Just in time for the stories.' },
    { speaker: 'ava', startMs: 8_600, endMs: 9_700, text: '(laughs)' },
    { speaker: 'ben', startMs: 8_700, endMs: 9_600, text: '(laughs)' },
  ],
};

const CROWD = ['Ana', 'Bo', 'Cai', 'Dee', 'Eli', 'Fen', 'Gus', 'Hal', 'Ivy', 'Jo'];
export const crowd = {
  name: 'crowd',
  description: 'Ten people arrive over 5 s, three leave early, three-way crosstalk, people wander.',
  durationMs: 20_000,
  characters: CROWD.map((name, i) => ({
    id: name.toLowerCase(), displayName: name, userId: `sq:2${String(i).padStart(3, '0')}`, pitchHz: 100 + i * 17, position: circle(CROWD.length, 3, i),
    sessions: [{ joinMs: i * 500, ...(i % 4 === 3 ? { leaveMs: 9_000 + i * 700 } : {}) }],
    walks: i % 3 === 0 ? [{ fromMs: 4_000 + i * 300, toMs: 6_000 + i * 300, to: circle(CROWD.length, 1.5, i) }] : [],
  })),
  lines: [
    { speaker: 'ana', startMs: 600, endMs: 3_200, text: 'Is everyone here yet?' },
    { speaker: 'cai', startMs: 3_400, endMs: 5_000, text: 'Almost.' },
    { speaker: 'eli', startMs: 5_200, endMs: 8_000, text: 'Let us start.' },
    { speaker: 'bo', startMs: 7_600, endMs: 9_800, text: 'Wait, one question.' },
    { speaker: 'fen', startMs: 9_000, endMs: 11_000, text: 'Me too.' },
    { speaker: 'gus', startMs: 9_400, endMs: 10_600, text: 'And me.' },
    { speaker: 'ivy', startMs: 11_500, endMs: 14_500, text: 'One at a time, please.' },
    { speaker: 'jo', startMs: 15_000, endMs: 17_000, text: 'Thank you all.' },
    { speaker: 'ana', startMs: 17_400, endMs: 19_600, text: 'See you next week.' },
  ],
};

export const reconnect = {
  name: 'reconnect',
  description: 'Ava drops for 1 s and reconnects as the same peer; Ben leaves and returns later as a new peer.',
  durationMs: 14_000,
  characters: [
    { id: 'ava', displayName: 'Ava', userId: 'sq:1001', pitchHz: 210, position: [-1, 0, 1], sessions: [{ joinMs: 0, leaveMs: 4_000, peerId: 'p-ava' }, { joinMs: 5_000, peerId: 'p-ava' }] },
    { id: 'ben', displayName: 'Ben', userId: 'sq:1002', pitchHz: 115, position: [1, 0, 1], sessions: [{ joinMs: 0, leaveMs: 6_000 }, { joinMs: 9_000 }] },
    { id: 'cy', displayName: 'Cy', userId: 'sq:1003', pitchHz: 160, position: [0, 0, -1.5] },
  ],
  lines: [
    { speaker: 'ava', startMs: 500, endMs: 3_500, text: 'Can you hear me now?' },
    { speaker: 'cy', startMs: 3_700, endMs: 4_900, text: 'You cut out.' },
    { speaker: 'ava', startMs: 5_300, endMs: 7_500, text: 'Back again.' },
    { speaker: 'cy', startMs: 7_700, endMs: 8_800, text: 'Where did Ben go?' },
    { speaker: 'ben', startMs: 9_300, endMs: 12_000, text: 'Sorry, had to restart.' },
    { speaker: 'ava', startMs: 12_200, endMs: 13_600, text: 'Welcome back.' },
  ],
};

export const mutes = {
  name: 'mutes',
  description: 'Short mutes (80, 150, 250 ms) mid-sentence, a 2 s mute, and someone muted throughout.',
  durationMs: 12_000,
  characters: [
    { id: 'ava', displayName: 'Ava', userId: 'sq:1001', pitchHz: 210, position: [-1, 0, 1], mutes: [{ fromMs: 1_200, toMs: 1_280 }, { fromMs: 2_000, toMs: 2_150 }, { fromMs: 2_800, toMs: 3_050 }] },
    { id: 'ben', displayName: 'Ben', userId: 'sq:1002', pitchHz: 115, position: [1, 0, 1], mutes: [{ fromMs: 5_000, toMs: 7_000 }] },
    { id: 'cy', displayName: 'Cy', userId: 'sq:1003', pitchHz: 160, position: [0, 0, -1.5], mutes: [{ fromMs: 0, toMs: 12_000 }] },
    // Unmutes mid-syllable, so only treating the mute's gap as silence can end her first turn.
    { id: 'dee', displayName: 'Dee', userId: 'sq:1004', pitchHz: 185, position: [0, 0, 2], mutes: [{ fromMs: 1_000, toMs: 2_600 }] },
  ],
  lines: [
    { speaker: 'dee', startMs: 500, endMs: 4_000, text: 'Testing, one two, testing.' },
    { speaker: 'ava', startMs: 500, endMs: 4_000, text: 'I keep tapping the mute button by accident.' },
    { speaker: 'ben', startMs: 4_300, endMs: 8_500, text: 'Hold on, my dog is barking. Okay, back.' },
    { speaker: 'cy', startMs: 8_700, endMs: 10_000, text: '(talking while muted)' },
    { speaker: 'ava', startMs: 10_200, endMs: 11_800, text: 'Cy, you are muted.' },
  ],
};

export const network = {
  name: 'network',
  description: 'Voice delivery stalls (400 and 150 ms) then bursts, a frozen transform, a 150 ms process stall, a peer at 10 Hz.',
  durationMs: 15_000,
  characters: [
    { id: 'ava', displayName: 'Ava', userId: 'sq:1001', pitchHz: 210, position: [-1, 0, 1] },
    { id: 'ben', displayName: 'Ben', userId: 'sq:1002', pitchHz: 115, position: [1, 0, 1], walks: [{ fromMs: 2_000, toMs: 6_000, to: [2, 0, -1] }] },
    { id: 'far', displayName: 'Far Away', userId: 'sq:1009', pitchHz: 150, position: [12, 0, 12], transformHz: 10, walks: [{ fromMs: 8_000, toMs: 12_000, to: [10, 0, 9] }] },
  ],
  lines: [
    { speaker: 'ava', startMs: 400, endMs: 4_500, text: 'My connection is terrible tonight.' },
    { speaker: 'ben', startMs: 4_700, endMs: 8_000, text: 'You froze for a second there.' },
    { speaker: 'far', startMs: 8_200, endMs: 11_000, text: 'Can anyone hear me from over here?' },
    { speaker: 'ava', startMs: 11_200, endMs: 14_600, text: 'Yes, faintly.' },
  ],
  faults: {
    voiceStalls: [{ fromMs: 1_500, toMs: 1_900 }, { fromMs: 9_000, toMs: 9_150 }],
    transformFreezes: [{ peer: 'ben', fromMs: 3_000, toMs: 3_600 }],
    clockStalls: [{ atMs: 7_000, durationMs: 150 }],
  },
};

export const bones = {
  name: 'bones',
  description: 'One peer never sends bone poses; another starts sending them 2 s after joining.',
  durationMs: 8_000,
  characters: [
    { id: 'ava', displayName: 'Ava', userId: 'sq:1001', pitchHz: 210, position: [-1, 0, 1] },
    { id: 'rob', displayName: 'Robot', userId: 'guest:4004', pitchHz: 95, position: [1, 0, 1], bones: false },
    { id: 'cy', displayName: 'Cy', userId: 'sq:1003', pitchHz: 160, position: [0, 0, -1.5], sessions: [{ joinMs: 1_000 }], bones: { fromMs: 3_000 } },
  ],
  lines: [
    { speaker: 'rob', startMs: 300, endMs: 2_500, text: 'Beep. I have no skeleton.' },
    { speaker: 'cy', startMs: 3_200, endMs: 5_500, text: 'My avatar took a while to load.' },
    { speaker: 'ava', startMs: 5_700, endMs: 7_800, text: 'Looks fine now.' },
  ],
};

export const edge = {
  name: 'edge',
  description: 'A 20 ms blink-in-and-out, a non-ASCII name, someone leaving at 0.5 s, and an empty room at the end.',
  durationMs: 10_000,
  characters: [
    { id: 'zoe', displayName: 'Zoë 🌟 李', userId: 'sq:1010', pitchHz: 230, position: [-1, 0, 1], sessions: [{ joinMs: 0, leaveMs: 8_000 }] },
    { id: 'early', displayName: 'Early Leaver', userId: 'sq:1011', pitchHz: 130, position: [1, 0, 1], sessions: [{ joinMs: 0, leaveMs: 500 }] },
    { id: 'blink', displayName: 'Blink', userId: 'guest:1012', pitchHz: 170, position: [0, 0, -1], sessions: [{ joinMs: 5_000, leaveMs: 5_020 }] },
    { id: 'max', displayName: 'Max', userId: 'sq:1013', pitchHz: 120, position: [0, 0, 1.5], sessions: [{ joinMs: 2_000, leaveMs: 7_900 }] },
  ],
  lines: [
    { speaker: 'zoe', startMs: 200, endMs: 2_400, text: 'Bye Early!' },
    { speaker: 'max', startMs: 2_500, endMs: 5_500, text: 'Did someone just flicker in?' },
    { speaker: 'zoe', startMs: 5_700, endMs: 7_700, text: 'Time to go, everyone out.' },
  ],
};

// Ten minutes, procedurally scripted (seeded, so it is the same every run): memory, disk and speed at length.
function longScenario() {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const names = ['Ari', 'Bea', 'Col', 'Dot'];
  const durationMs = 600_000;
  const characters = names.map((name, i) => ({
    id: name.toLowerCase(), displayName: name, userId: `sq:5${i}`, pitchHz: 110 + i * 35, position: circle(4, 2, i),
    walks: Array.from({ length: 6 }, (_, k) => {
      const fromMs = 30_000 + k * 90_000 + Math.round(rand() * 30_000);
      return { fromMs, toMs: fromMs + 4_000, to: [Math.round((rand() * 6 - 3) * 10) / 10, 0, Math.round((rand() * 6 - 3) * 10) / 10] };
    }),
  }));
  const lines = [];
  for (let t = 500; t < durationMs - 4_000;) {
    const speaker = names[Math.floor(rand() * names.length)].toLowerCase();
    const len = 1_500 + Math.round(rand() * 6_000);
    lines.push({ speaker, startMs: t, endMs: Math.min(t + len, durationMs - 500), text: `line ${lines.length + 1}` });
    t += len + 300 + Math.round(rand() * 2_500);
  }
  return { name: 'long', description: 'Four people, ten minutes, procedurally scripted.', durationMs, characters, lines };
}
export const long = longScenario();

// Everything at once: 16 people over 45 s with every kind of fault, seeded so it's the same every run.
function chaosScenario() {
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (n) => Math.floor(rand() * n);
  const durationMs = 45_000;
  const names = ['Ada', 'Bix', 'Cleo', 'Dax', 'Eve', 'Fitz', 'Gia', 'Hugo', 'Iris', 'Jax', 'Kai', 'Lux', 'Mo', 'Nia', 'Oz', 'Pip'];
  const characters = names.map((name, i) => {
    const join = i < 6 ? 0 : 800 + pick(15_000);
    const c = { id: name.toLowerCase(), displayName: name, userId: `sq:9${i}`, pitchHz: 95 + i * 11, position: circle(names.length, 4, i), sessions: [{ joinMs: join }] };
    const r = rand();
    if (r < 0.2) { const leave = join + 6_000 + pick(10_000); c.sessions = [{ joinMs: join, leaveMs: leave, peerId: `p-${c.id}` }, { joinMs: leave + 300 + pick(1_500), peerId: `p-${c.id}` }]; } // reconnect, same peer
    else if (r < 0.35) { const leave = join + 5_000 + pick(8_000); c.sessions = [{ joinMs: join, leaveMs: leave }, { joinMs: leave + 2_000 + pick(5_000) }]; } // returns as a new peer
    else if (r < 0.45) c.sessions = [{ joinMs: join, leaveMs: join + 4_000 + pick(15_000) }]; // leaves for good
    c.mutes = Array.from({ length: pick(4) }, () => { const at = 1_000 + pick(40_000); return { fromMs: at, toMs: at + [60, 120, 180, 350, 900, 2_500][pick(6)] }; }).sort((a, b) => a.fromMs - b.fromMs);
    c.walks = Array.from({ length: pick(3) }, (_, k) => { const at = 3_000 + k * 12_000 + pick(8_000); return { fromMs: at, toMs: at + 2_000 + pick(3_000), to: circle(names.length, 1.5 + rand() * 3, pick(16)) }; });
    if (i === 7) c.bones = false;
    if (i === 9) c.bones = { fromMs: join + 2_500 };
    if (i % 5 === 4) c.transformHz = [10, 20, 30][pick(3)];
    return c;
  });
  // Merge overlapping mutes so the scene stays well-formed.
  for (const c of characters) c.mutes = c.mutes.reduce((out, m) => { const last = out.at(-1); if (last && m.fromMs <= last.toMs) last.toMs = Math.max(last.toMs, m.toMs); else out.push({ ...m }); return out; }, []);
  const lines = [];
  for (let t = 400; t < durationMs - 2_000;) {
    const speaker = names[pick(names.length)].toLowerCase();
    const len = 800 + pick(4_000);
    lines.push({ speaker, startMs: t, endMs: Math.min(durationMs - 200, t + len), text: `chaos ${lines.length + 1}` });
    t += rand() < 0.3 ? 200 + pick(600) : len + pick(1_200); // 30% of lines overlap the previous one
  }
  return {
    name: 'chaos', description: 'Sixteen people, 45 s: churn, reconnects, mutes, crosstalk, stalls, freezes, low-rate and boneless peers.', durationMs, characters, lines,
    faults: {
      voiceStalls: [{ fromMs: 7_000, toMs: 7_350 }, { fromMs: 21_000, toMs: 21_120 }, { fromMs: 33_500, toMs: 34_100 }],
      transformFreezes: [{ peer: 'cleo', fromMs: 12_000, toMs: 12_800 }, { peer: 'kai', fromMs: 28_000, toMs: 29_500 }],
      clockStalls: [{ atMs: 17_000, durationMs: 120 }],
    },
  };
}
export const chaos = chaosScenario();

export const scenarios = { campfire, crowd, reconnect, mutes, network, bones, edge, chaos, long };

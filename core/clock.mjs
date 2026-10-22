// Clocks shared by the mock room and the recorder, so both see the same time.
//   wallClock(): real time, for live rooms (or watching the mock in real time).
//   virtualClock(): runs a scripted scene instantly; timers fire in time order with no waiting.

export function wallClock() {
  const t0 = performance.now();
  return {
    kind: 'wall',
    now: () => performance.now() - t0,
    every(ms, fn) {
      const h = setInterval(fn, ms);
      return () => clearInterval(h);
    },
    async runFor(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}

export function virtualClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    kind: 'virtual',
    now: () => now,
    every(ms, fn) {
      const id = nextId++;
      timers.set(id, { period: ms, next: now + ms, fn });
      return () => timers.delete(id);
    },
    async runFor(ms) {
      const end = now + ms;
      for (;;) {
        let due;
        for (const t of timers.values()) if (!due || t.next < due.next) due = t;
        if (!due || due.next > end) break;
        now = due.next;
        due.next += due.period;
        due.fn();
        // Let promise callbacks scheduled by a timer run before the next one fires.
        await Promise.resolve();
      }
      now = end;
    },
  };
}

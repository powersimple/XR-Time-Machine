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

// `stalls` simulates the process freezing (GC, the OS): [{ atMs, durationMs }]. Timers due during a stall all
// fire once when it ends, then carry on from there, as Node's own timers do.
export function virtualClock({ stalls = [] } = {}) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const pending = [...stalls].sort((a, b) => a.atMs - b.atMs);
  let fired = 0;
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
        if (pending.length && pending[0].atMs <= due.next) {
          const stall = pending.shift();
          now = stall.atMs + stall.durationMs;
          for (const t of timers.values()) if (t.next < now) t.next = now;
          continue;
        }
        now = due.next;
        due.next += due.period;
        due.fn();
        // Let promise callbacks scheduled by a timer run before the next one fires, and every so often let
        // Node do real I/O, as it would between ticks in real time; otherwise file writes queue up in memory.
        await Promise.resolve();
        if (++fired % 200 === 0) await new Promise((resolve) => setImmediate(resolve));
      }
      now = end;
    },
  };
}

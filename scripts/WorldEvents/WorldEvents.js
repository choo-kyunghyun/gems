/**
 * The world's event queue: off-focus world state (a trader crossing maps, a scheduled raid, a
 * timed respawn) advances by DISCRETE scheduled events, not by simulating a scene every frame.
 * `update(now)` fires every due event whatever map is active.
 *
 * Time is an absolute in-game hour count, so a fast-forward advances schedules for free; the
 * queue never reads the clock itself. The queue is data and rides the save; the handlers are
 * wiring a scene registers at create, and a due kind with no handler is dropped.
 */
globalThis.WorldEvents = {
  KEY: "events", // the record's key on the world entity; a save holds it
  _handlers: {}, // kind -> fn(data) ; wiring, not data

  /** The queue record — `{ q: [{ at, kind, data }] }`, kept sorted ascending by `at` (soonest first). */
  state() {
    return World.table.of(World.self, WorldEvents.KEY, () => ({ q: [] }));
  },

  /**
   * Register the handler for an event kind (last registration wins).
   */
  on(kind, fn) {
    WorldEvents._handlers[kind] = fn;
  },

  /**
   * Queue an event to fire at absolute in-game hour `at`. `data` is a flat scalar payload (kept
   * save-safe — no nested objects/arrays, docs/GMRT.md #15565). Insertion-sorted so update() can
   * stop at the first not-yet-due event.
   */
  schedule(at, kind, data) {
    const q = WorldEvents.state().q;
    const e = { at: at, kind: kind, data: data };
    // linear is fine — the queue holds a handful of events
    let i = q.length;
    while (i > 0 && q[i - 1].at > at) i--;
    q.splice(i, 0, e);
  },

  /**
   * Fire every event whose time has come (at <= now), in time order, dispatching to its handler.
   * Handlers may schedule follow-ups; a follow-up dated in the past (or == now) fires next frame,
   * not this one — the due events are spliced out BEFORE dispatch, so a repeat scheduler can't
   * hang the game.
   */
  update(now) {
    const q = WorldEvents.state().q;
    let due = 0;
    while (due < q.length && q[due].at <= now) due++;
    if (due === 0) return;
    const fire = q.splice(0, due);
    for (let i = 0; i < fire.length; i++) {
      const e = fire[i];
      const h = WorldEvents._handlers[e.kind];
      if (h !== undefined) h(e.data);
    }
  },

  clearKind(kind) {
    const q = WorldEvents.state().q;
    let n = 0;
    for (let i = q.length - 1; i >= 0; i--)
      if (q[i].kind === kind) {
        q.splice(i, 1);
        n++;
      }
    return n;
  },

  /** Drop the handlers; the queue goes with the world's records. */
  reset() {
    WorldEvents._handlers = {};
  },
};

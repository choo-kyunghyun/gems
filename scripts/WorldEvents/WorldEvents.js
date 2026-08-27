/**
 * One world, one queue; kept off WorldClock so the clock stays the pure temporal authority (same
 * split as Temperature).
 *
 * The point: off-focus world state (a wandering trader crossing maps, a scheduled raid, a timed
 * respawn) advances by DISCRETE scheduled events, not by simulating a scene every frame. `update(now)`
 * fires every event whose time has come, whatever map is active — the queue is blind to which scene is
 * loaded. Handlers do the work (they touch the active World only at a hydrate/dehydrate boundary).
 *
 * Time is an absolute in-game hour count (WorldClock.absHours() = (day-1)*24 + hour), so sleeping
 * (Time.scale) fast-forwards schedules for free and the queue freezes in the lobby (WorldClock only
 * advances while the colony scene steps). Generic on `now` — it never reads WorldClock itself.
 */
globalThis.WorldEvents = {
  _q: [], // [{ at, kind, data }] — kept sorted ascending by `at` (soonest first)
  _handlers: {}, // kind -> fn(data) ; a kind with no handler is dropped when due

  /**
   * Register the handler for an event kind (last registration wins). Do this once at scene setup.
   */
  on(kind, fn) {
    WorldEvents._handlers[kind] = fn;
  },

  /**
   * Queue an event to fire at absolute in-game hour `at`. `data` is a flat scalar payload (kept
   * save-safe — no nested objects/arrays; the JSON nested-value fault). Insertion-sorted so update()
   * can stop at the first not-yet-due event.
   */
  schedule(at, kind, data) {
    const q = WorldEvents._q;
    const e = { at: at, kind: kind, data: data };
    // find the insertion point (ascending `at`); linear is fine — the queue holds a handful of events
    let i = q.length;
    while (i > 0 && q[i - 1].at > at) i--;
    q.splice(i, 0, e);
  },

  /**
   * Fire every event whose time has come (at <= now), in time order, dispatching to its handler.
   * Handlers may schedule follow-ups; a follow-up dated in the past (or == now) fires next frame,
   * not this one — the due events are spliced out BEFORE dispatch (a shift-per-dispatch loop would
   * re-enter a same-frame follow-up and a repeat scheduler could hang the game).
   */
  update(now) {
    const q = WorldEvents._q;
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
    const q = WorldEvents._q;
    let n = 0;
    for (let i = q.length - 1; i >= 0; i--)
      if (q[i].kind === kind) {
        q.splice(i, 1);
        n++;
      }
    return n;
  },

  /** The queue as save data (flat scalar payloads — see schedule). */
  export() {
    return { q: WorldEvents._q.slice() };
  },

  /** Replace the queue with a saved one (already in `at` order). Handlers are untouched. */
  import(data) {
    WorldEvents._q =
      data !== undefined && data.q !== undefined ? data.q.slice() : [];
  },

  /** Handlers are kept — re-register per scene. */
  reset() {
    WorldEvents._q = [];
  },
};

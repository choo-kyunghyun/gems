/**
 * Only the active level is stepped each frame, so a single accumulator is authoritative (a parked map
 * isn't ticked, so it needs no clock of its own). Converts this frame's sim time (Time.delta) into a
 * whole number of fixed ticks and exposes `alpha`, the [0,1) render-interpolation remainder renderers
 * lerp by.
 *
 * Distinct from WorldClock (in-game time-of-day / calendar): SimClock is the engine TICK RATE — "World
 * rules tickrate". A singleton (one sim clock), like WorldClock / Time.
 */
globalThis.SimClock = {
  tickDuration: 1 / 60, // seconds per fixed tick (60 Hz)
  accumulator: 0,
  alpha: 0, // [0,1) render-interpolation factor = drained accumulator / tickDuration
  maxTicks: 5, // spiral-of-death guard: drop backlog instead of freezing the frame

  /**
   * Advance the accumulator by this frame's sim time; return the whole ticks to run this frame, capped
   * by maxTicks (under overload the sim slows instead of freezing). Sets `alpha` from the remainder.
   *
   * THE TICK LOOP a level's step() builds around this call — two ordering contracts:
   *   for (t < advance()) { InterpolationSystem.snapshot(entities)  FIRST — records pre-move
   *                         <the genre's system sequence, a Pipeline>       positions
   *                         entities.flush() }                        LAST — commits the tick's
   *                                                                          queued removals
   * Once-per-FRAME work (edge-triggered input latching, NavGrid.rebuild) sits outside the loop:
   * a frame can run 0 ticks (dropping a press) or several (double-counting one).
   */
  advance() {
    SimClock.accumulator += Time.delta;
    let ticks = Math.floor(SimClock.accumulator / SimClock.tickDuration);
    SimClock.accumulator -= ticks * SimClock.tickDuration;
    if (ticks > SimClock.maxTicks) ticks = SimClock.maxTicks;
    SimClock.alpha = SimClock.accumulator / SimClock.tickDuration;
    return ticks;
  },

  /**
   * Drop accumulated sub-tick phase (new base level). alpha resets too; harmless mid-play since
   * freshly-spawned entities have PrevPosition == Position (alpha then interpolates to a no-op).
   */
  reset() {
    SimClock.accumulator = 0;
    SimClock.alpha = 0;
  },
};

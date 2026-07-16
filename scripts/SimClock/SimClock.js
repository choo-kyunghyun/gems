// The fixed-step SIMULATION clock — a World sub-module (World.sim). ONE global clock: only the active
// level is stepped each frame, so a single accumulator is authoritative (a parked map isn't ticked, so
// it needs no clock of its own). Converts this frame's sim time (Time.delta) into a whole number of
// fixed ticks and exposes `alpha`, the [0,1) render-interpolation remainder renderers lerp by.
//
// Distinct from WorldClock (in-game time-of-day / calendar): SimClock is the engine TICK RATE — this
// is "World rules tickrate". Was the inline clock on the old store class; moved out so the Entity
// store is pure entity/component data. Static singleton (one sim clock), like WorldClock / Time.
globalThis.SimClock = class SimClock {
  static tickDuration = 1 / 60; // seconds per fixed tick (60 Hz)
  static accumulator = 0;
  static alpha = 0; // [0,1) render-interpolation factor = drained accumulator / tickDuration
  static maxTicks = 5; // spiral-of-death guard: drop backlog instead of freezing the frame

  // Advance the accumulator by this frame's sim time; return the whole ticks to run this frame, capped
  // by maxTicks (under overload the sim slows instead of freezing). Sets `alpha` from the remainder.
  static advance() {
    SimClock.accumulator += Time.delta;
    let ticks = Math.floor(SimClock.accumulator / SimClock.tickDuration);
    SimClock.accumulator -= ticks * SimClock.tickDuration;
    if (ticks > SimClock.maxTicks) ticks = SimClock.maxTicks;
    SimClock.alpha = SimClock.accumulator / SimClock.tickDuration;
    return ticks;
  }

  // Drop accumulated sub-tick phase (new base scene). alpha resets too; harmless mid-play since
  // freshly-spawned entities have PrevPosition == Position (alpha then interpolates to a no-op).
  static reset() {
    SimClock.accumulator = 0;
    SimClock.alpha = 0;
  }
};

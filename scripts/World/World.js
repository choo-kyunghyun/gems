// The world-manager singleton — the TOP coordinator layer. A thin namespace object (one world) that
// COMPOSES the world-scope sub-modules; it runs no simulation of its own, only delegates:
//   • sim          — SimClock: the fixed-step engine TICK RATE (advance/alpha/tickDuration).
//   • WorldClock   — in-game time-of-day / calendar (distinct from the sim tick above).
//   • WorldEvents  — cross-level scheduled events (off-focus world state, e.g. a wandering trader).
//   • levels       — LevelManager: the resident-level registry, the active-level stack, faded
//                    transitions + pause, and whole-entity transfer between levels (folds in the old
//                    Universe + SceneManager).
// `sim`/`levels` are wired in obj_game Create_0 (where load order is safe).
//
// Was the per-instance entity store; that moved to `Entity` (a Level sub-module, `level.world`). This
// name is now the manager. The methods reference the sub-modules lazily, so load order among the
// world scripts is irrelevant.
//
// Phases 2-3 landed: `levels` (LevelManager) + `sim` (SimClock) are live. update()/reset() below stay
// inert for now — the existing direct WorldClock.* / WorldEvents.* call sites (sceneRpg) are UNCHANGED,
// so nothing invokes World.update/reset yet; a later phase routes time-of-day through them.
globalThis.World = {
  sim: null, // SimClock (the class) — assigned once in obj_game Create_0
  levels: null, // LevelManager instance — assigned once in obj_game Create_0

  // Advance world-scope time, then fire every event now due on that timeline. NOT yet wired: sceneRpg
  // still calls WorldClock.update / WorldEvents.update directly; phase 2 routes them through here.
  /** @param {number} dt seconds elapsed (sim time) */
  update(dt) {
    WorldClock.update(dt);
    WorldEvents.update(WorldClock.absHours());
  },

  // New game / scene teardown: reset the world-scope singletons.
  reset() {
    WorldClock.reset();
    WorldEvents.reset();
  },
};

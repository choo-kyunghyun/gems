// The world-manager singleton — the TOP coordinator layer: a thin namespace (one world) that COMPOSES
// the world-scope sub-modules and runs no simulation of its own. Sub-modules on the declaration below.
/**
 * Composes the world-scope sub-modules, delegating rather than simulating:
 *   • sim          — SimClock: the fixed-step engine TICK RATE (advance/alpha/tickDuration).
 *   • WorldClock   — in-game time-of-day / calendar (distinct from the sim tick above).
 *   • WorldEvents  — cross-level scheduled events (off-focus world state, e.g. a wandering trader).
 *   • levels       — LevelManager: the resident-level registry, the active-level stack, faded
 *                    transitions + pause, and whole-entity transfer between levels.
 * `sim`/`levels` are wired in obj_game Create_0 (where load order is safe); the methods reference the
 * sub-modules lazily, so load order among the world scripts is irrelevant.
 */
globalThis.World = {
  sim: null, // SimClock — assigned once in obj_game Create_0
  levels: null, // LevelManager instance — assigned once in obj_game Create_0

  // Advance world-scope time, then fire every event now due on that timeline. NOT yet wired: sceneRpg
  // still calls WorldClock.update / WorldEvents.update directly; phase 2 routes them through here.
  /** @param {number} dt seconds elapsed (sim time) */
  update(dt) {
    WorldClock.update(dt);
    WorldEvents.update(WorldClock.absHours());
  },

  // New game / level teardown: reset the world-scope singletons.
  reset() {
    WorldClock.reset();
    WorldEvents.reset();
  },
};

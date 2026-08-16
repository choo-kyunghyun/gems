// The world-manager singleton — the TOP coordinator layer: a thin namespace (one world) that COMPOSES
// the world-scope sub-modules and runs no simulation of its own. Sub-modules on the declaration below.
/**
 * Composes the world-scope sub-modules, delegating rather than simulating:
 *   • WorldClock   — in-game time-of-day / calendar, advanced by update() below.
 *   • WorldEvents  — cross-level scheduled events (off-focus world state, e.g. a wandering trader).
 *   • levels       — LevelManager: the resident-level registry, the active-level stack, faded
 *                    transitions + pause, and whole-entity transfer between levels.
 * SimClock — the fixed-step engine TICK RATE, distinct from WorldClock — is world-scope too, but the
 * active level's step() drives it, not this file. Those three singletons are reached by their own
 * global, never mirrored into a member here: a member would be a second name for one object plus a
 * boot-wiring dependency. `levels` IS a member because it is the one live INSTANCE of a class,
 * constructed in Game Create_0 where load order is safe; the methods reference the singletons
 * lazily, so load order among them is irrelevant.
 */
globalThis.World = {
  levels: null, // LevelManager instance — assigned once in Game Create_0

  // Advance world-scope time, then fire every event now due on that timeline. NOT yet wired: sceneRpg
  // still calls WorldClock.update / WorldEvents.update directly; phase 2 routes them through here.
  /** @param {number} dt seconds elapsed (sim time) */
  update(dt) {
    WorldClock.update(dt);
    WorldEvents.update(WorldClock.absHours());
  },

  /** New game / level teardown: reset the world-scope singletons. */
  reset() {
    WorldClock.reset();
    WorldEvents.reset();
  },
};

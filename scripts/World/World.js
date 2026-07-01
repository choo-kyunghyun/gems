// The world-manager singleton — the TOP coordinator layer. A thin static namespace (one world) that
// COMPOSES the world-scope sub-modules; it runs no simulation of its own, only delegates:
//   • WorldClock   — time / tickrate authority (the sim clock)
//   • WorldEvents  — cross-level scheduled events (off-focus world state, e.g. a wandering trader)
//   • levels       — LevelManager: the resident-level registry, the active-level stack, faded
//                    transitions + pause, and whole-entity transfer between levels (folds in the old
//                    Universe + SceneManager). Assigned once in obj_game Create_0.
//
// Was the per-instance ECS store class; that moved to `ECS` (a Level sub-module, `level.ecs`). This
// name is now the manager. Static namespace, not a class — GMRT miscompiles static computed getters,
// and the methods reference the sub-modules lazily so load order among the world scripts is irrelevant.
//
// PHASE 2 landed: `levels` (LevelManager) is live. update()/reset() below stay inert for now — the
// existing direct WorldClock.* / WorldEvents.* call sites (sceneRpg) are UNCHANGED, so nothing invokes
// World.update/reset yet; phase 3 routes the clock/events through them.
globalThis.World = {
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

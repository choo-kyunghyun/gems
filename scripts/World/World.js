/**
 * THE LEVEL POOL — a flat mapId -> Level index of every RESIDENT level, plus the world-scope
 * timeline that runs across all of them. World is the bundle-and-manager of Levels (CONCEPT.md);
 * it holds no screen state and never draws — the Game object owns the active Scene.
 *
 * A pooled level stays ALIVE for the session: a map is built from file exactly ONCE, then only
 * parks and thaws, so a door trip never rebuilds it. take/put move a WHOLE entity (all components,
 * via EntitySnapshot) between two resident levels' stores — the travelling-squad and
 * wandering-trader path; a map id with no resident level THROWS from either, since the caller
 * names a pooled map it owns. `reset()` drops the index and the timeline; the owner frees the
 * levels first (their stores are its to destroy).
 *
 * The world-scope singletons it delegates to are reached by their own global, never mirrored into
 * a member here (a member would be a second name for one object plus a boot-wiring dependency):
 *   • WorldClock   — in-game time-of-day / calendar. The active scene's update() advances it
 *                    (sceneColony: `WorldClock.update`, then `WorldEvents.update` on its
 *                    timeline); this file only resets it.
 *   • WorldEvents  — cross-level scheduled events (off-focus world state, e.g. a wandering trader).
 * SimClock — the fixed-step engine TICK RATE, distinct from WorldClock — is world-scope too, and
 * likewise the active scene's to drive.
 */
globalThis.World = {
  levels: {}, // mapId -> Level. plain object — for...in is GMRT-safe, Map iteration is not
  activeId: null, // the mapId the active scene is currently stepping + drawing

  /** Index a level under its map id. Overwrites — a rebuilt map replaces its entry. */
  add(mapId, level) {
    World.levels[mapId] = level;
  },

  get(mapId) {
    const lv = World.levels[mapId];
    return lv !== undefined ? lv : null;
  },

  ids() {
    return Object.keys(World.levels);
  },

  /**
   * Capture a WHOLE entity (all components) out of a resident level's store and remove it. Returns
   * the snapshot (the caller now owns it). EntitySnapshot references the component data objects,
   * so they survive the remove/flush (see EntitySnapshot).
   *
   * The one component that does NOT travel is `Instance`: a puppet belongs to the source store's
   * roster, which reaps it once the entity leaves (InstanceSystem), so a carried handle would go
   * dead — the destination mints its own puppet on its first SkeletonSystem pass and re-dresses it.
   */
  take(mapId, id) {
    const lv = World.get(mapId);
    if (lv === null) throw new Error(`World.take: map "${mapId}" is not resident`);
    const snap = EntitySnapshot.capture(lv.entities, id); // no component list → every component
    lv.entities.remove(id);
    if (snap.components[Instance] !== undefined) {
      const comps = {};
      for (const token in snap.components)
        if (token !== Instance) comps[token] = snap.components[token];
      snap.components = comps;
    }
    return snap;
  },

  /**
   * Restore a whole-entity snapshot into a resident level's store; `overrides` apply after (e.g. a
   * fresh Position for the destination). Returns the new id.
   */
  put(mapId, snap, overrides) {
    const lv = World.get(mapId);
    if (lv === null) throw new Error(`World.put: map "${mapId}" is not resident`);
    return EntitySnapshot.restore(lv.entities, snap, overrides);
  },

  /** New game / world teardown: drop the pool (the owner freed the levels) and the timeline. */
  reset() {
    World.levels = {};
    World.activeId = null;
    WorldClock.reset();
    WorldEvents.reset();
  },
};

/**
 * THE WORLD — the level pool and the world's own data, the one write place of the layer above a
 * Level. `levels` is a flat mapId -> Level index of every RESIDENT level; `meta` the world-scope
 * records (Records), keyed by the consumer that owns each — the clock (`WorldClock.KEY`), the
 * sky (`Weather.KEY`), the event queue (`WorldEvents.KEY`), the progression (`Tracker.KEY`) —
 * so a save's world half is `World.meta.export()` and nothing world-scope lives in a singleton.
 * The consumers are logic over their record (`WorldClock.state()` seeds and returns the clock),
 * reached by their own global, never mirrored into a member here (a member would be a second
 * name for one object plus a boot-wiring dependency): the active scene's update() drives them
 * (sceneColony: `WorldClock.update`, then `WorldEvents.update` on its timeline). SimClock — the
 * fixed-step engine TICK RATE, distinct from WorldClock — is frame state, likewise the active
 * scene's to drive. World holds no screen state and never draws — the Game object owns the
 * active Scene.
 *
 * A pooled level stays ALIVE for the session: a map is built from file exactly ONCE, then only
 * parks and thaws, so a door trip never rebuilds it — its data in the Level, its runtime in the
 * Level's cache. take/put move a WHOLE entity (all components, via EntitySnapshot) between two
 * resident levels' stores — the travelling-squad and wandering-trader path; a map id with no
 * resident level THROWS from either, since the caller names a pooled map it owns. `reset()`
 * frees every pooled level (their caches with them) and blanks the records.
 */
globalThis.World = {
  levels: {}, // mapId -> Level. plain object — for...in is GMRT-safe, Map iteration is not
  activeId: null, // the mapId the active scene is currently stepping + drawing
  meta: new Records(), // the world's records — replaced whole by reset()

  /** Index a level under its map id. Overwrites — a rebuilt map replaces its entry. */
  add(mapId, level) {
    World.levels[mapId] = level;
  },

  get(mapId) {
    const lv = World.levels[mapId];
    return lv !== undefined ? lv : null;
  },

  /** The active level (World.get of `activeId`), or null between maps. */
  active() {
    return World.activeId === null ? null : World.get(World.activeId);
  },

  ids() {
    return Object.keys(World.levels);
  },

  /**
   * The record under `key`, seeded by `make()` when absent — the one idiom every world-scope
   * consumer reads its state through, so a fresh world starts every record blank.
   */
  record(key, make) {
    let rec = World.meta.get(key);
    if (rec === undefined) {
      rec = make();
      World.meta.set(key, rec);
    }
    return rec;
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

  /**
   * New game / world teardown: free every pooled level, drop the pool, blank the records and the
   * event wiring (the head composes its family — WorldEvents' handlers are a scene's to re-register).
   */
  reset() {
    for (const id in World.levels) World.levels[id].destroy();
    World.levels = {};
    World.activeId = null;
    World.meta = new Records();
    WorldEvents.reset();
  },
};

/**
 * THE WORLD — the level pool and the world's own data, the one write place of the layer above a
 * Level. `levels` is a flat mapId -> Level index of every RESIDENT level; `meta` the world-scope
 * records (Records), keyed by the consumer that owns each — the clock (`WorldClock.KEY`), the
 * sky (`Weather.KEY`), the event queue (`WorldEvents.KEY`), the progression (`Tracker.KEY`) —
 * so a save's world half is `World.meta.export()` and nothing world-scope lives in a singleton.
 * The consumers are logic over their record (`WorldClock.state()` seeds and returns the clock),
 * reached by their own global, never mirrored into a member here (a member would be a second
 * name for one object plus a boot-wiring dependency): the active scene's update() drives them
 * (sceneColony: `WorldClock.update`, then `WorldEvents.update` on its timeline). World holds no screen state and never draws — the Game object owns the
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
  cache: new Cache(), // the world's derived runtime (Cache) — freed by reset()

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
    return World.meta.of(key, make);
  },

  /**
   * Capture a WHOLE entity (every persistent component) out of a resident level's store and
   * remove it. Returns the snapshot (the caller now owns it). EntitySnapshot references the
   * component data objects, so they survive the remove/flush (see EntitySnapshot).
   *
   * A minted component (EntityStore.mint) does not travel: the puppet goes with the source
   * store's slot (its release hook — Puppets), and the destination re-mints its own on its first
   * pass; a path or a diff baseline is likewise the destination's.
   */
  take(mapId, id) {
    const lv = World.get(mapId);
    if (lv === null) throw new Error(`World.take: map "${mapId}" is not resident`);
    const snap = EntitySnapshot.capture(lv.entities, id); // no list → every persistent one
    lv.entities.remove(id);
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
    World.cache.destroy();
    WorldEvents.reset();
  },
};

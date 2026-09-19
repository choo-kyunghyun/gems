/**
 * THE WORLD — the level pool and the world's own data, the one write place of the layer above a
 * Level: one Table, `table`. Its row `self` carries the world-scope records as components
 * under the consumer that owns each — the clock (`WorldClock.KEY`), the sky (`Weather.KEY`), the
 * event queue (`WorldEvents.KEY`), the progression (`Tracker.KEY`) — and every RESIDENT map is an
 * entity of its own carrying its identity (`MAP` — { id }, saved) and its `Level` (`LEVEL` —
 * minted, freed with the entity through `level.destroy`), so a save's world half is
 * `World.table.export()` and nothing world-scope lives in a singleton. The consumers are logic
 * over their record (`WorldClock.state()` seeds and returns the clock through
 * `World.table.of(World.self, KEY, make)`), reached by their own global, never mirrored into a
 * member here (a member would be a second name for one object plus a boot-wiring dependency): the
 * active scene's update() drives them (sceneColony: `WorldClock.update`, then `WorldEvents.update`
 * on its timeline). World holds no screen state and never draws — the Game object owns the
 * active Scene.
 *
 * A pooled level stays ALIVE for the session: a map is built from file exactly ONCE, then only
 * parks and thaws, so a door trip never rebuilds it — its data and runtime both in the Level.
 * take/put move a WHOLE entity (all components, via Row) between two resident levels'
 * stores — the travelling-squad and wandering-trader path; a map id with no resident level THROWS
 * from either, since the caller names a pooled map it owns. `reset()` blanks the store — every
 * pooled level freed with its entity, every record gone.
 *
 * A map entity outlives a store import without its Level (minted — dropped like any): a load
 * restores the roster with the records, and the maps pass hands each its Level back through `add`,
 * which finds the entity by id (SaveGame). `self` is index 0 of a store that holds nothing else
 * yet, so it keeps its id across that import (Level.self's rule).
 */
globalThis.World = {
  CAPACITY: 64, // the world store's size — self plus one entity per resident map
  LEVEL: "level", // a map entity's Level — minted, freed with the entity
  MAP: "map", // a map entity's identity — { id: mapId }; a save carries it
  activeId: null, // the mapId the active scene is currently stepping + drawing
  table: null, // the world's own store — seeded below, blanked whole by reset()
  self: -1, // the world's own entity — its records (and, one day, its derived entries)

  /** The map entity under `mapId`, or -1. */
  _find(mapId) {
    let found = -1;
    World.table.forEach([World.MAP], (id, m) => {
      if (m.id === mapId) found = id;
    });
    return found;
  },

  /**
   * Pool a level under its map id — onto the map entity already there (a loaded roster, a
   * rebuilt map: the Level it held is freed) or a new one.
   */
  add(mapId, level) {
    let id = World._find(mapId);
    if (id === -1) {
      id = World.table.create();
      World.table.add(id, World.MAP, { id: mapId });
    }
    World.table.mint(id, World.LEVEL, level, World._free);
  },

  /** The resident level under `mapId`, or null. */
  get(mapId) {
    const id = World._find(mapId);
    if (id === -1) return null;
    const lv = World.table.get(id, World.LEVEL);
    return lv === undefined ? null : lv;
  },

  /** The active level (World.get of `activeId`), or null between maps. */
  active() {
    return World.activeId === null ? null : World.get(World.activeId);
  },

  /** The map ids with a resident level. */
  ids() {
    const out = [];
    World.table.forEach([World.MAP, World.LEVEL], (_id, m) => {
      out.push(m.id);
    });
    return out;
  },

  _free(level) {
    level.destroy();
  },

  /**
   * Capture a WHOLE entity (every persistent component) out of a resident level's store and
   * remove it. Returns the snapshot (the caller now owns it). Row references the
   * component data objects, so they survive the remove/flush (see Row).
   *
   * A minted component (Table.mint) does not travel: the puppet goes with the source
   * store's slot (its release hook — Puppets), and the destination re-mints its own on its first
   * pass; a path or a diff baseline is likewise the destination's.
   */
  take(mapId, id) {
    const lv = World.get(mapId);
    if (lv === null) throw new Error(`World.take: map "${mapId}" is not resident`);
    const snap = Row.capture(lv.entities, id); // no list → every persistent one
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
    return Row.restore(lv.entities, snap, overrides);
  },

  /**
   * New game / world teardown: blank the world's store — every pooled level freed with its map
   * entity, every record and derived entry gone (a fresh world seeds each anew) — and the event
   * wiring (the head composes its family — WorldEvents' handlers are a scene's to re-register).
   */
  reset() {
    World.activeId = null;
    World.table.destroy();
    World.self = World.table.create();
    WorldEvents.reset();
  },
};
World.table = new Table(World.CAPACITY);
World.self = World.table.create();

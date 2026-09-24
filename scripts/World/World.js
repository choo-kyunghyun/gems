/**
 * THE WORLD — the level pool and the world's own data, the one write place above a Level: one
 * Table, `table`. Its row `self` carries the world-scope records, each as a component under its
 * owner's key, and every RESIDENT map is an entity carrying its identity (`MAP`, saved) and its
 * minted `Level`, so a save's world half is `table.export()` and nothing world-scope lives in a
 * singleton. The record owners reach it by their own global, never mirrored into a member here.
 * World holds no screen state — which map is active is the scene's — and never draws.
 *
 * A pooled level stays alive for the session: a map is built exactly once, then only parks and
 * thaws. take/put move a WHOLE entity between two resident levels; a map id with no resident
 * level throws, since the caller names a pooled map it owns.
 *
 * A store import restores the map entities without their Levels (minted data is not saved);
 * `add` hands each its Level back by map id. `self` is index 0 of a store holding nothing else
 * yet, so it keeps its id across that import.
 */
globalThis.World = {
  CAPACITY: 64, // self plus one entity per resident map
  LEVEL: "level", // minted, freed with the entity
  MAP: "map", // { id: mapId }; saved
  table: null,
  self: -1, // the entity carrying the world-scope records

  /** The map entity under `mapId`, or -1. */
  _find(mapId) {
    let found = -1;
    World.table.forEach([World.MAP], (id, m) => {
      if (m.id === mapId) found = id;
    });
    return found;
  },

  /** Pool a level under its map id, freeing any Level that map entity already held. */
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
   * Capture every persistent component of an entity and remove it; the caller owns the record.
   * Minted components do not travel — the destination re-mints its own.
   */
  take(mapId, id) {
    const lv = World.get(mapId);
    if (lv === null) throw new Error(`World.take: map "${mapId}" is not resident`);
    const record = Row.capture(lv.entities, id);
    lv.entities.remove(id);
    return record;
  },

  /** Restore a record into a resident level; `overrides` apply after. Returns the new id. */
  put(mapId, record, overrides) {
    const lv = World.get(mapId);
    if (lv === null) throw new Error(`World.put: map "${mapId}" is not resident`);
    return Row.restore(lv.entities, record, overrides);
  },

  /**
   * New game / teardown: blank the store — every pooled level freed, every record gone — and the
   * event wiring, whose handlers are the scene's to re-register.
   */
  reset() {
    World.table.destroy();
    World.self = World.table.create();
    WorldEvents.reset();
  },
};
World.table = new Table(World.CAPACITY);
World.self = World.table.create();

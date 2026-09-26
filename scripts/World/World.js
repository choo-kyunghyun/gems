/**
 * THE WORLD — the level pool and the world's own data, the one write place above a Level: one
 * Table, `table`. Its row `self` carries the world-scope records, each as a component under its
 * owner's key, and every pooled level is an entity carrying its map id (`MAP`, saved) and the
 * minted `Level`, so a save's world half is `table.export()`. World is data: it holds no screen
 * state — which map is active is the scene's — and runs no logic of its own.
 *
 * A world lives as long as the scene that made it: installed as `active`, it is the one a record
 * owner's accessor reads, and `destroy` frees every pooled level with it. With none installed a
 * record read throws rather than reach a world that is gone.
 *
 * A pooled level stays alive until the caller removes it, freed with its entity; while pooled it
 * only parks and thaws. take/put move a WHOLE entity between two resident levels; a map id with no
 * resident level throws, since the caller names a pooled map it owns.
 *
 * A store import restores the pooled levels' entities without their Levels (minted data is not
 * saved); `add` hands each its Level back by map id. `self` is index 0 of a store holding nothing
 * else yet, so it keeps its id across that import.
 */
globalThis.World = class World {
  static CAPACITY = 64; // self plus one entity per resident map
  static LEVEL = "level"; // minted, freed with the entity
  static MAP = "map"; // { id: mapId }; saved
  static active = null; // the live scene's world, or null

  constructor() {
    this.table = new Table(World.CAPACITY);
    this.self = this.table.create(); // the entity carrying the world-scope records
  }

  /** The world-scope record under `key`, seeded by `make` on a miss. */
  of(key, make) {
    return this.table.of(this.self, key, make);
  }

  /** The pooled level's entity under `mapId`, or -1. */
  _find(mapId) {
    let found = -1;
    this.table.forEach([World.MAP], (id, m) => {
      if (m.id === mapId) found = id;
    });
    return found;
  }

  /** Pool a level under its map id, freeing any Level that map entity already held. */
  add(mapId, level) {
    let id = this._find(mapId);
    if (id === -1) {
      id = this.table.create();
      this.table.add(id, World.MAP, { id: mapId });
    }
    this.table.add(id, World.LEVEL, level, { mint: true, destroy: World._free });
  }

  /** The resident level under `mapId`, or null. */
  get(mapId) {
    const id = this._find(mapId);
    if (id === -1) return null;
    const lv = this.table.get(id, World.LEVEL);
    return lv === undefined ? null : lv;
  }

  /** Drop a map from the pool, freeing its Level; a map not pooled is a no-op. */
  remove(mapId) {
    const id = this._find(mapId);
    if (id === -1) return;
    this.table.remove(id);
    this.table.flush();
  }

  ids() {
    const out = [];
    this.table.forEach([World.MAP, World.LEVEL], (_id, m) => {
      out.push(m.id);
    });
    return out;
  }

  static _free(level) {
    level.destroy();
  }

  /**
   * Capture every persistent component of an entity and remove it; the caller owns the record.
   * Minted components do not travel — the destination re-mints its own.
   */
  take(mapId, id) {
    const lv = this.get(mapId);
    if (lv === null) throw new Error(`World.take: map "${mapId}" is not resident`);
    const record = Row.capture(lv.entities, id);
    lv.entities.remove(id);
    return record;
  }

  /** Restore a record into a resident level; `overrides` apply after. Returns the new id. */
  put(mapId, record, overrides) {
    const lv = this.get(mapId);
    if (lv === null) throw new Error(`World.put: map "${mapId}" is not resident`);
    return Row.restore(lv.entities, record, overrides);
  }

  /** Frees the store — every pooled level with it, every record gone. */
  destroy() {
    this.table.destroy();
  }
};

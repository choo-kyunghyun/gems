/**
 * THE WORLD — the level pool and the world's own data, one layer above a Level. Its records are
 * components of `self`, the one entity of its store `table`, each under its owner's key, so a
 * save's world half is `table.export()`; its `levels` are the resident maps, each pooled under its
 * own id. World is data: it holds no screen state — which map is active is the scene's — and runs
 * no logic of its own.
 *
 * A world lives as long as the scene that opened it: `open` installs it as `active`, the one a
 * record owner's accessor reads, and `destroy` uninstalls it and frees every pooled level. With
 * none installed a record read throws rather than reach a world that is gone.
 *
 * A pooled level stays alive until the caller removes it; take/put move a WHOLE entity between two
 * resident levels, and a map id with no resident level throws, since the caller names a pooled map
 * it owns.
 */
globalThis.World = class World {
  static active = null; // the live scene's world, or null

  /** A fresh world, installed as `active`. */
  static open() {
    const w = new World();
    World.active = w;
    return w;
  }

  constructor() {
    this.table = new Table(1); // `self` alone
    this.self = this.table.create();
    this.levels = []; // in pooling order: read it, never reorder it
  }

  /** The world-scope record under `key`, seeded by `make` on a miss. */
  of(key, make) {
    return this.table.of(this.self, key, make);
  }

  _index(mapId) {
    const levels = this.levels;
    for (let i = 0; i < levels.length; i++) if (levels[i].id === mapId) return i;
    return -1;
  }

  /** Pool a level under its id, freeing any level that id already held. */
  add(level) {
    const i = this._index(level.id);
    if (i === -1) {
      this.levels.push(level);
      return;
    }
    const prev = this.levels[i];
    this.levels[i] = level;
    if (prev !== level) prev.destroy();
  }

  /** The resident level under `mapId`, or null. */
  get(mapId) {
    const i = this._index(mapId);
    return i === -1 ? null : this.levels[i];
  }

  /** Drop a map from the pool, freeing its level; a map not pooled is a no-op. */
  remove(mapId) {
    const i = this._index(mapId);
    if (i === -1) return;
    const level = this.levels[i];
    this.levels.splice(i, 1);
    level.destroy();
  }

  /**
   * Capture every persistent component of an entity and remove it; the caller owns the record.
   * Minted components do not travel — the destination re-mints its own.
   */
  take(mapId, id) {
    const lv = this.get(mapId);
    if (lv === null) throw new Error(`World.take: map "${mapId}" is not resident`);
    const record = lv.entities.capture(id);
    lv.entities.remove(id);
    return record;
  }

  /** Restore a record into a resident level; `overrides` apply after. Returns the new id. */
  put(mapId, record, overrides) {
    const lv = this.get(mapId);
    if (lv === null) throw new Error(`World.put: map "${mapId}" is not resident`);
    return lv.entities.restore(record, overrides);
  }

  /** Uninstalls the world and frees every pooled level and record with it. */
  destroy() {
    if (World.active === this) World.active = null;
    const levels = this.levels;
    for (let i = 0; i < levels.length; i++) levels[i].destroy();
    levels.length = 0;
    this.table.destroy();
  }
};

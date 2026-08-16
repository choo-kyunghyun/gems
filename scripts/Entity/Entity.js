/** @typedef {Object} EntityOpts @property {number} [gravity] override GravitySystem.strength for this store */
globalThis.Entity = class Entity {
  constructor(maxEntities, opts = {}) {
    this.maxEntities = maxEntities;
    this.ids = new EntityID(maxEntities);
    this.storage = new EntityData(maxEntities, this.ids);
    this._pending = [];
    this.gravity = opts.gravity ?? null;
    /**
     * Opt-in pair grid, assigned post-construction once world dims are known
     * (contract at Broadphase). NEVER null: consumers gate on `!== undefined`.
     */
    this.broadphase = undefined;
  }

  destroy() {
    this.storage.destroy();
    this.ids.reset();
  }

  create() {
    return this.ids.alloc();
  }

  isValid(id) {
    return this.ids.isValid(id);
  }

  /** Queued removals still count until flush(). */
  count() {
    return this.ids.count();
  }

  /** Deferred — committed by flush(). */
  remove(id) {
    this._pending.push(id);
  }

  /**
   * Commit all queued removals: clear each entity's component slots, then free its id.
   * Removal is DEFERRED so a system can remove while iterating a query result — the caller
   * flushes at a safe point, canonically as the last step of a sim tick, never mid-iteration.
   * A stale queued id (double-removed, or freed+recycled since queuing) is skipped with a warn —
   * clearing by raw index would wipe the recycled slot's new owner.
   */
  flush() {
    for (const id of this._pending) {
      if (!this.ids.isValid(id)) {
        Log.warn("Entity.flush: stale remove for id " + id + " — skipped");
        continue;
      }
      this.storage.clear(EntityID.getIndex(id));
      this.ids.free(id);
    }
    this._pending = [];
  }

  register(ComponentClass) {
    this.storage.register(ComponentClass);
    return this;
  }

  add(id, ComponentClass, data) {
    this.storage.add(id, ComponentClass, data);
  }

  get(ComponentClass, id) {
    return this.storage.get(ComponentClass, id);
  }

  detach(id, ComponentClass) {
    this.storage.detach(id, ComponentClass);
  }

  componentsOf(id) {
    return this.storage.componentsOf(id);
  }

  query(...ComponentClasses) {
    return this.storage.query(ComponentClasses);
  }

  forEach(ComponentClasses, fn) {
    this.storage.forEach(ComponentClasses, fn);
  }

  export() {
    return { ids: this.ids.export(), components: this.storage.export() };
  }

  import(snapshot) {
    this.ids.import(snapshot.ids);
    this.storage.import(snapshot.components);
  }

  /**
   * Agent state dump: component data of `idOrIds` as JSON, written to `file`
   * in the save dir AND returned. A single id → a `{id, components}` record;
   * an id array → an array of records (whole store via `dump(this.query())`).
   * On-demand — call from a temp harness when needed. Uses the Json codec:
   * native JSON.stringify faults on nested data (GMRT.md #15565), and Json's
   * cycle/ref guards make dumping raw runtime state safe.
   * Returns undefined when the encode aborted (nothing written).
   */
  dump(idOrIds, file = "entity.json") {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    const records = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      records.push(
        this.isValid(id)
          ? { id, components: this.componentsOf(id) }
          : { id, valid: false },
      );
    }
    const json = Json.encode(Array.isArray(idOrIds) ? records : records[0]);
    if (json === undefined) return undefined; // encode aborted (already Log.error'd)
    File.write(file, json);
    return json;
  }
};

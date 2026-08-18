/** @typedef {Object} EntityStoreOpts @property {number} [gravity] override GravitySystem.strength for this store */
globalThis.EntityStore = class EntityStore {
  constructor(maxEntities, opts = {}) {
    this.maxEntities = maxEntities;
    this.ids = new EntityID(maxEntities);
    this.components = new ComponentStore(maxEntities, this.ids);
    this._pending = [];
    this.gravity = opts.gravity ?? null;
    /**
     * Opt-in pair grid, assigned post-construction once world dims are known
     * (contract at Broadphase). NEVER null: consumers gate on `!== undefined`.
     */
    this.broadphase = undefined;
  }

  destroy() {
    this.components.destroy();
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
        Log.warn("EntityStore.flush: stale remove for id " + id + " — skipped");
        continue;
      }
      this.components.clear(EntityID.index(id));
      this.ids.free(id);
    }
    this._pending = [];
  }

  register(token) {
    this.components.register(token);
    return this;
  }

  /** Per-entity accessors are ENTITY-FIRST (add/get/detach): a swapped pair would read
   *  as a miss, not an error — get() returns undefined for an unregistered component. */
  add(id, token, data) {
    this.components.add(id, token, data);
  }

  get(id, token) {
    return this.components.get(id, token);
  }

  detach(id, token) {
    this.components.detach(id, token);
  }

  componentsOf(id) {
    return this.components.componentsOf(id);
  }

  query(...tokens) {
    return this.components.query(tokens);
  }

  forEach(tokens, fn) {
    this.components.forEach(tokens, fn);
  }

  export() {
    return { ids: this.ids.export(), components: this.components.export() };
  }

  import(snapshot) {
    this.ids.import(snapshot.ids);
    this.components.import(snapshot.components);
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

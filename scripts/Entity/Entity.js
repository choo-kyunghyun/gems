// The per-level entity store — ids (EntityID) + component data (EntityData, SoA).
// One store per level (the ECS-shape invariant, ARCHITECTURE.md); `World` above it holds none.
/** @typedef {Object} EntityOpts @property {number} [gravity] override GravitySystem.strength for this store */
globalThis.Entity = class Entity {
  /**
   * @param {number} maxEntities slot capacity
   * @param {EntityOpts} [opts]
   */
  constructor(maxEntities, opts = {}) {
    this.maxEntities = maxEntities;
    // subsystems
    this.ids = new EntityID(maxEntities); // entity id allocation (generational)
    this.storage = new EntityData(maxEntities, this.ids); // component data (SoA)
    this._pending = []; // deferred-removal queue (committed by flush)
    this.gravity = opts.gravity ?? null;
    /**
     * @type {Broadphase|undefined} opt-in O(n) pair grid, assigned post-construction once world
     * dims are known (contract at Broadphase). NEVER null: consumers gate on `!== undefined`.
     */
    this.broadphase = undefined;
  }

  /** Level teardown: drop all storage + ids. */
  destroy() {
    this.storage.destroy();
    this.ids.reset();
  }

  // ── entity lifecycle (id subsystem) ──

  /** @returns {number} new entity id */
  create() {
    return this.ids.alloc();
  }

  /**
   * @param {number} id
   * @returns {boolean}
   */
  isValid(id) {
    return this.ids.isValid(id);
  }

  /** Live entities in this store; queued removals still count until flush(). @returns {number} */
  count() {
    return this.ids.count();
  }

  /** Queue removal; committed by flush(). @param {number} id */
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

  // ── component data (delegated to the storage subsystem; API kept identical) ──

  /**
   * Allocate storage for a component token (auto-called by add).
   * @param {string} ComponentClass
   * @returns {this}
   */
  register(ComponentClass) {
    this.storage.register(ComponentClass);
    return this;
  }

  /**
   * Set component data; auto-registers the token.
   * @param {number} id
   * @param {string} ComponentClass
   * @param {Object} data
   */
  add(id, ComponentClass, data) {
    this.storage.add(id, ComponentClass, data);
  }

  /**
   * @param {string} ComponentClass
   * @param {number} id
   * @returns {Object|undefined}
   */
  get(ComponentClass, id) {
    return this.storage.get(ComponentClass, id);
  }

  /**
   * @param {number} id
   * @param {string} ComponentClass
   */
  detach(id, ComponentClass) {
    this.storage.detach(id, ComponentClass);
  }

  /**
   * All components this entity has, keyed by token. Used by EntitySnapshot.
   * @param {number} id
   * @returns {Object<string,Object>}
   */
  componentsOf(id) {
    return this.storage.componentsOf(id);
  }

  /**
   * Ids of every entity with ALL listed components.
   * @param {...string} ComponentClasses
   * @returns {number[]}
   */
  query(...ComponentClasses) {
    return this.storage.query(ComponentClasses);
  }

  /**
   * Allocation-free query(): calls fn(id) per matching entity without materializing an array.
   * @param {string[]} ComponentClasses
   * @param {(id:number) => void} fn
   */
  forEach(ComponentClasses, fn) {
    this.storage.forEach(ComponentClasses, fn);
  }

  /** @returns {{ids:Object, components:Object<string,Array>}} sparse [index, data] entries per component */
  export() {
    return { ids: this.ids.export(), components: this.storage.export() };
  }

  /** Restore from export(); unknown component keys are ignored. @param {{ids:Object, components:Object<string,Array>}} snapshot */
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
   * @param {number|number[]} idOrIds
   * @param {string} [file="entity.json"]
   * @returns {string|undefined} undefined when the encode aborted (nothing written)
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

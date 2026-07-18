// The per-level entity store — ids (EntityID) + component data (EntityData).
// Contracts + naming (legacy `world` handles): docs/architecture/ecs.md.
/** @typedef {Object} EntityOpts @property {number} [gravity] override GravitySystem.strength for this store */
globalThis.Entity = class Entity {
  /** @param {number} maxEntities slot capacity @param {EntityOpts} [opts] */
  constructor(maxEntities, opts = {}) {
    this.maxEntities = maxEntities;
    // subsystems
    this.ids = new EntityID(maxEntities); // entity id allocation (generational)
    this.storage = new EntityData(maxEntities, this.ids); // component data (SoA)
    this._pending = []; // deferred-removal queue (committed by flush)
    this.gravity = opts.gravity ?? null;
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

  /** @param {number} id @returns {boolean} */
  isValid(id) {
    return this.ids.isValid(id);
  }

  /** Queue removal; committed by flush(). @param {number} id */
  remove(id) {
    this._pending.push(id);
  }

  /** Commit all queued removals: clear each entity's component slots, then free its id. */
  flush() {
    for (const id of this._pending) {
      this.storage.clear(EntityID.getIndex(id));
      this.ids.free(id);
    }
    this._pending = [];
  }

  // ── component data (delegated to the storage subsystem; API kept identical) ──

  /** Allocate storage for a component token (auto-called by add). @returns {this} */
  register(ComponentClass) {
    this.storage.register(ComponentClass);
    return this;
  }

  /** Set component data; auto-registers the token. @param {number} id @param {string} ComponentClass @param {Object} data */
  add(id, ComponentClass, data) {
    this.storage.add(id, ComponentClass, data);
  }

  /** @param {string} ComponentClass @param {number} id @returns {Object|undefined} */
  get(ComponentClass, id) {
    return this.storage.get(ComponentClass, id);
  }

  /** @param {number} id @param {string} ComponentClass */
  detach(id, ComponentClass) {
    this.storage.detach(id, ComponentClass);
  }

  /** All components this entity has, keyed by token. Used by EntitySnapshot. @param {number} id @returns {Object<string,Object>} */
  componentsOf(id) {
    return this.storage.componentsOf(id);
  }

  /** Ids of every entity with ALL listed components. @param {...string} ComponentClasses @returns {number[]} */
  query(...ComponentClasses) {
    return this.storage.query(ComponentClasses);
  }

  /** Allocation-free query(): calls fn(id) per matching entity without materializing an array. @param {string[]} ComponentClasses @param {(id:number) => void} fn */
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
   * @param {number|number[]} idOrIds @param {string} [file="entity.json"]
   * @returns {string}
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
    File.write(file, json);
    return json;
  }
};

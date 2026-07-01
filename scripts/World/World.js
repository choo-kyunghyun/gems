// ECS core, as a thin SUBSYSTEM COORDINATOR: World owns its subsystems — `ids` (IdPool, id lifecycle)
// and `storage` (ECSStorage, component data) — plus an inline fixed-rate sim clock. The component-store
// methods below are one-line delegates to `storage`, so World's public API is unchanged (every system /
// scene / Query / EntitySnapshot still calls world.add/get/query/... exactly as before). Each scene owns
// its own `world`; there is no global. The clock (tickDuration/alpha/gravity) stays inline because
// systems + renderers read it directly as `world.*`.
/** @typedef {Object} WorldOpts @property {number} [gravity] override GravitySystem.strength for this world */
globalThis.World = class World {
  /** @param {number} maxEntities slot capacity @param {number} [tickrate=60] sim ticks/sec @param {WorldOpts} [opts] */
  constructor(maxEntities, tickrate = 60, opts = {}) {
    this.maxEntities = maxEntities;
    // subsystems
    this.ids = new IdPool(maxEntities); // entity id allocation (generational)
    this.storage = new ECSStorage(maxEntities, this.ids); // component data (SoA)
    // inline sim clock (read externally as world.tickDuration / world.alpha)
    this.tickDuration = 1 / tickrate;
    this.accumulator = 0;
    this.alpha = 0;
    this.maxTicks = 5; // spiral-of-death guard: drop backlog instead of freezing the frame
    this._pending = [];
    this.gravity = opts.gravity ?? null;
  }

  /** Scene teardown: drop all storage + ids. */
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
      this.storage.clear(IdPool.getIndex(id));
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

  // ── sim clock ──

  /** Advance the fixed-step accumulator; sets `alpha` (render-interpolation factor). @returns {number} ticks to run */
  update() {
    this.accumulator += Time.delta;
    let ticks = Math.floor(this.accumulator / this.tickDuration);
    this.accumulator -= ticks * this.tickDuration;
    // Spiral-of-death guard: cap ticks so a slow frame doesn't owe an ever-growing backlog —
    // sim time slows under overload rather than freezing; alpha uses the drained accumulator.
    if (ticks > this.maxTicks) ticks = this.maxTicks;
    this.alpha = this.accumulator / this.tickDuration;
    return ticks;
  }
};

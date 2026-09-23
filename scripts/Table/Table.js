/**
 * The id-keyed store: a table of rows (generational handles) by columns (string tokens, one
 * sparse set each), the one shape every layer's data takes, its row 0 the layer itself. A row's
 * datum under a token is pure data the caller shapes; the table holds, walks and serializes it
 * and never reads it. Removal is deferred to a flush. Neutral: it knows no level, world or
 * scene.
 */
globalThis.Table = class Table {
  constructor(maxEntities) {
    this.maxEntities = maxEntities;
    this.ids = new Handle(maxEntities);
    this.components = new Columns(maxEntities, this.ids);
    this._pending = [];
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
   * Removal is deferred so a system can remove while iterating; flush at a safe point, the last
   * step of a sim tick. Mid-walk it throws: an index it frees could be recycled into the same
   * walk. A stale queued id is skipped with a warning, since clearing by raw index would wipe a
   * recycled slot's new owner.
   */
  flush() {
    if (this.components.walking()) throw new Error("Table.flush: called mid-walk");
    for (const id of this._pending) {
      if (!this.ids.isValid(id)) {
        Log.warn("Table.flush: stale remove for id " + id + " — skipped");
        continue;
      }
      this.components.clear(Handle.index(id));
      this.ids.free(id);
    }
    this._pending = [];
  }

  register(token) {
    this.components.register(token);
    return this;
  }

  /** Per-entity accessors are entity-first: a swapped pair reads as a miss, not an error. */
  add(id, token, data) {
    this.components.add(id, token, data);
  }

  /** `add` for a runtime-rebuilt component: no export or whole-entity snapshot carries a minted
   *  token. `destroy(data)`, when given, releases a datum as it leaves its slot, so a component
   *  holding a native handle frees it there. */
  mint(id, token, data, destroy) {
    this.components.mint(id, token, data, destroy);
  }

  /** The token's raw column, for a per-tick reader. */
  column(token) {
    return this.components.column(token);
  }

  get(id, token) {
    return this.components.get(id, token);
  }

  /** The component under `token`, seeded by `make()` when absent: how a consumer reads the
   *  record it owns on a layer's own row, so a fresh layer starts every record blank.
   *  Persistent, like any `add`. */
  of(id, token, make) {
    let data = this.components.get(id, token);
    if (data === undefined) {
      data = make();
      this.components.add(id, token, data);
    }
    return data;
  }

  /** `of` for what a consumer derives from the layer's data and keeps between frames: minted,
   *  so no export carries it, and freed through its own `destroy()` when it has one as it leaves
   *  its slot. Never a source of truth; a miss is never an error. */
  derive(id, token, make) {
    let data = this.components.get(id, token);
    if (data === undefined) {
      data = make();
      this.components.mint(id, token, data, Table._free);
    }
    return data;
  }

  static _free(data) {
    if (data === null) return;
    if (typeof data !== "object") return;
    if (typeof data.destroy === "function") data.destroy();
  }

  /** `c` is `{ pack(data) → buffer, unpack(buffer) → data }`; the token's entries cross
   *  export/import as blobs. */
  codec(token, c) {
    this.components.codec(token, c);
  }

  /** `get` that throws on a miss. */
  require(id, token) {
    return this.components.require(id, token);
  }

  has(id, token) {
    return this.components.has(id, token);
  }

  detach(id, token) {
    this.components.detach(id, token);
  }

  componentsOf(id) {
    return this.components.componentsOf(id);
  }

  /** The entity's components minus the minted ones — what a whole-entity snapshot carries. */
  persistentOf(id) {
    return this.components.persistentOf(id);
  }

  /** Ids carrying every token; no tokens means every live id. */
  query(...tokens) {
    if (tokens.length === 0) return this.ids.live();
    return this.components.query(tokens);
  }

  /** First matching id, or -1. */
  first(...tokens) {
    return this.components.first(tokens);
  }

  /** Allocation-free iteration, data handed to the callback. */
  forEach(tokens, fn) {
    this.components.forEach(tokens, fn);
  }

  /** `sink(token, index, buffer)` returns what the export holds for each codec entry. */
  export(sink) {
    return { ids: this.ids.export(), components: this.components.export(sink) };
  }

  /** `source(value)` hands each codec entry its buffer back. */
  import(snapshot, source) {
    this.ids.import(snapshot.ids);
    this.components.import(snapshot.components, source);
  }

  /**
   * Debug dump of `idOrIds` as JSON, written to `file` in the save dir and returned; an id array
   * gives an array of records. BUG: native JSON.stringify faults on nested data (docs/GMRT.md),
   * so it goes through the guarded codec. Returns undefined when the encode aborted.
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
    if (json === undefined) return undefined; // encode aborted, already logged
    File.write(file, json);
    return json;
  }
};

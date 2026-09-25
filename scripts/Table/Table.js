/**
 * The id-keyed store: a table of rows (generational handles) by columns (string tokens, one
 * sparse set each), the one shape every layer's data takes, its row 0 the layer itself. A row's
 * datum under a token is pure data the caller shapes; the table holds, walks and serializes it
 * and reads it only to fill its blank. Removal is deferred to a flush. Neutral: it knows no
 * level, world or scene.
 *
 * Blanks: `Blank[token]` is a token's field defaults, declared beside its typedef. Every datum
 * that enters a set — by `add` or by `import` — has each blank field it leaves undefined filled
 * in place with a copy of its own, so no two rows share a blank's nested data; a field whose
 * absence means something stays out of the blank. A token with no blank is stored as given.
 *
 * Layout (SoA): per token, `column[i]` is row index i's data (`undefined` = absent, so
 * `get`/`has` cost a column read), `dense` lists the indices carrying the token, and `sparse[i]`
 * is index i's position in `dense` (-1 = absent). A walk runs down the LEAD token's dense list
 * and joins the rest by column read, so the rarest token should lead: it alone decides the walk's
 * length.
 *
 * Order: a dense list is insertion order until a removal, which swap-removes, so walks run in an
 * order stable between mutations and otherwise unspecified — never by index. A carrier only ever
 * moves toward the front, so a forward position cursor reaches it.
 *
 * Removal safety: `detach` and a flush empty the slot at once and, while a walk is on that token,
 * defer the swap-remove until the outermost walk ends, so a callback may detach the lead token
 * from any entity. A carrier added mid-walk is visited from the next walk.
 *
 * Persistence: a set is transient once an add mints its token — rebuilt at runtime, so `export`
 * and `persistentOf` skip it. An add may hand the set a release hook, `destroy(data)`, called as
 * data leaves its slot by any path, so a component holding a native handle frees it with no reap
 * pass.
 *
 * A set may carry a binary codec (`pack(data)` → buffer, `unpack(buffer)` → data): its entries
 * cross `export`/`import` as buffers through the caller's sink and source, for what is dense and
 * what JSON can't carry (docs/GMRT.md #15565). An import fills the codec sets last, so an unpack
 * may read a record the same import restored.
 */
// scripts load by name (docs/GMRT.md), so a component script may open it first
globalThis.Blank ??= {};

globalThis.Table = class Table {
  /** The lead size below which a walk's order costs too little to warn about. */
  static LEAD_WARN = 64;

  constructor(maxEntities) {
    this.maxEntities = maxEntities;
    this.ids = new Handle(maxEntities);
    this._byToken = new Map();
    // BUG: iterate _tokens/_sets (the Map's mirror, registration order), never a Map iterator
    // (docs/GMRT.md #15095); the Map is only O(1) token lookup.
    this._tokens = [];
    this._sets = [];
    this._misled = {}; // token lists already warned for a trailing token rarer than the lead
    this._joins = []; // query/first's join columns: they run no callback, so nothing re-enters it
    this._pending = [];
  }

  destroy() {
    const sets = this._sets;
    for (let c = 0; c < sets.length; c++) this._release(sets[c]);
    this._byToken.clear();
    this._tokens = [];
    this._sets = [];
    this.ids.reset();
  }

  /** Run a set's release hook over every carried datum — the store or the set is going whole. */
  _release(set) {
    if (set.destroy === undefined) return;
    const dense = set.dense;
    const column = set.column;
    for (let p = 0; p < dense.length; p++) {
      const data = column[dense[p]];
      if (data !== undefined) set.destroy(data);
    }
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
    if (this._walking()) throw new Error("Table.flush: called mid-walk");
    const sets = this._sets;
    for (const id of this._pending) {
      if (!this.ids.isValid(id)) {
        Log.warn("Table.flush: stale remove for id " + id + " — skipped");
        continue;
      }
      const index = Handle.index(id);
      for (let c = 0; c < sets.length; c++) {
        const set = sets[c];
        if (set.sparse[index] !== -1) this._drop(set, index);
      }
      this.ids.free(id);
    }
    this._pending = [];
  }

  register(token) {
    if (!this._byToken.has(token)) {
      const blank = Blank[token];
      const set = {
        column: new Array(this.maxEntities).fill(undefined),
        dense: [],
        sparse: new Array(this.maxEntities).fill(-1),
        walking: 0, // forEach nesting depth with this token as the lead
        pending: [], // indices whose swap-remove waits for the walk to end
        transient: false, // minted: skipped by export/persistentOf
        destroy: undefined, // release hook, called as data leaves a slot
        codec: undefined, // { pack, unpack }
        blank: blank,
        fill: blank === undefined ? undefined : Object.keys(blank),
      };
      this._byToken.set(token, set);
      this._tokens.push(token);
      this._sets.push(set);
    }
    return this;
  }

  /**
   * The one way data enters a row: filled from the token's blank, then stored. Per-entity
   * accessors are entity-first: a swapped pair reads as a miss, not an error. `opts.mint` marks a
   * runtime-rebuilt token, which no export or whole-entity snapshot carries from then on;
   * `opts.destroy(data)` is the set's release hook — one per token, the first given.
   */
  add(id, token, data, opts) {
    let set = this._byToken.get(token);
    if (set === undefined) {
      this.register(token);
      set = this._byToken.get(token);
    }
    if (set.fill !== undefined) Table._fill(set, data);
    const i = id & Handle.INDEX_MASK;
    if (set.destroy !== undefined) {
      const prev = set.column[i];
      if (prev !== undefined) if (prev !== data) set.destroy(prev); // replaced: the old data is released
    }
    set.column[i] = data;
    if (set.sparse[i] === -1) {
      set.sparse[i] = set.dense.length;
      set.dense.push(i);
    }
    if (opts === undefined) return;
    if (opts.mint === true) set.transient = true;
    if (opts.destroy !== undefined) if (set.destroy === undefined) set.destroy = opts.destroy;
  }

  static _fill(set, data) {
    const keys = set.fill;
    const blank = set.blank;
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      if (data[key] === undefined) data[key] = Plain.copy(blank[key]);
    }
  }

  /** `c` is `{ pack(data) → buffer, unpack(buffer) → data }`; the token's entries cross
   *  export/import as blobs. Set before the store is exported or imported. */
  codec(token, c) {
    this.register(token);
    this._byToken.get(token).codec = c;
  }

  /** The token's column, registered if new — a per-tick reader hoists it once and indexes it by
   *  `id & Handle.INDEX_MASK` in place of a `get` per entity, never holding it past the tick. */
  column(token) {
    this.register(token);
    return this._byToken.get(token).column;
  }

  get(id, token) {
    const set = this._byToken.get(token);
    if (set === undefined) return undefined;
    return set.column[id & Handle.INDEX_MASK];
  }

  /** The component under `token`, seeded by `make()` when absent: how a consumer reads the
   *  record it owns on a layer's own row, so a fresh layer starts every record blank.
   *  Persistent, like any `add`. */
  of(id, token, make) {
    let data = this.get(id, token);
    if (data === undefined) {
      data = make();
      this.add(id, token, data);
    }
    return data;
  }

  /** `of` for what a consumer derives from the layer's data and keeps between frames: minted,
   *  so no export carries it, and freed through its own `destroy()` when it has one as it leaves
   *  its slot. Never a source of truth; a miss is never an error. */
  derive(id, token, make) {
    let data = this.get(id, token);
    if (data === undefined) {
      data = make();
      this.add(id, token, data, { mint: true, destroy: Table._free });
    }
    return data;
  }

  static _free(data) {
    if (data === null) return;
    if (typeof data !== "object") return;
    if (typeof data.destroy === "function") data.destroy();
  }

  /** The component the caller's contract requires — throws on a miss (an unregistered token
   *  included), where `get` reads undefined for a component whose absence is a state. */
  require(id, token) {
    const set = this._byToken.get(token);
    const data = set === undefined ? undefined : set.column[id & Handle.INDEX_MASK];
    if (data === undefined)
      throw new Error(`entity ${id} carries no ${token}`);
    return data;
  }

  /** BUG: no `&&` (docs/GMRT.md #15549). */
  has(id, token) {
    const set = this._byToken.get(token);
    if (set === undefined) return false;
    return set.column[id & Handle.INDEX_MASK] !== undefined;
  }

  detach(id, token) {
    const set = this._byToken.get(token);
    if (set !== undefined) this._drop(set, id & Handle.INDEX_MASK);
  }

  /** Empty index i's slot now (releasing its data through the set's hook); its dense entry goes
   *  now, or when the walk on this token ends. */
  _drop(set, i) {
    if (set.sparse[i] === -1) return;
    const data = set.column[i];
    set.column[i] = undefined;
    if (set.destroy !== undefined) if (data !== undefined) set.destroy(data);
    if (set.walking > 0) set.pending.push(i);
    else this._compact(set, i);
  }

  /** Swap-remove index i from the dense list — the last carrier takes its position. */
  _compact(set, i) {
    const p = set.sparse[i];
    if (p === -1) return; // already gone (queued twice)
    if (set.column[i] !== undefined) return; // re-added during the walk — still a carrier
    const dense = set.dense;
    const last = dense.length - 1;
    const j = dense[last];
    dense[p] = j;
    set.sparse[j] = p;
    set.sparse[i] = -1;
    dense.length = last;
  }

  /**
   * A walk on `set` ended: drain the swap-removes it deferred. A callback that THROWS leaves the
   * depth raised, so that token's list stops compacting — the walk still skips the holes, and
   * the exception is the bug, not this.
   */
  _settle(set) {
    set.walking--;
    if (set.walking > 0) return;
    const pending = set.pending;
    if (pending.length === 0) return;
    for (let k = 0; k < pending.length; k++) this._compact(set, pending[k]);
    pending.length = 0;
  }

  /** Whether a walk is running on any token. */
  _walking() {
    const sets = this._sets;
    for (let c = 0; c < sets.length; c++) if (sets[c].walking > 0) return true;
    return false;
  }

  /** Warn once per token list whose trailing token has under half the lead's carriers. */
  _warnLead(tokens, lead) {
    if (lead.dense.length < Table.LEAD_WARN) return;
    for (let c = 1; c < tokens.length; c++) {
      const set = this._byToken.get(tokens[c]);
      if (set.dense.length * 2 >= lead.dense.length) continue;
      const key = tokens.join(",");
      if (this._misled[key] === true) return;
      this._misled[key] = true;
      Log.warn(
        `Table.forEach: [${key}] leads ${lead.dense.length} carriers, ` +
          `but ${set.dense.length} carry a trailing token — lead with the rarer one`,
      );
      return;
    }
  }

  /** Every component of the entity, token → data (a debug dump's shape). */
  componentsOf(id) {
    return this._of(id, false);
  }

  /** `componentsOf` minus the transient sets — the shape a whole-entity snapshot carries. */
  persistentOf(id) {
    return this._of(id, true);
  }

  _of(id, skipTransient) {
    const out = {};
    const i = id & Handle.INDEX_MASK;
    for (let c = 0; c < this._tokens.length; c++) {
      const set = this._sets[c];
      // BUG: comparisons as the operands, never a bare flag left of && (docs/GMRT.md #15549)
      if (skipTransient === true && set.transient === true) continue;
      const data = set.column[i];
      if (data !== undefined) out[this._tokens[c]] = data;
    }
    return out;
  }

  /**
   * The lead's set with the other tokens' columns in `this._joins[1..]`, or undefined when a
   * token was never registered. BUG: an undefined token kills the runner as a Map key
   * (docs/GMRT.md #15567), so one is refused before any lookup, as is an empty list, which has no
   * lead.
   */
  _join(tokens, op) {
    const n = tokens.length;
    if (n === 0) throw new Error(`Table.${op}: no tokens`);
    for (let c = 0; c < n; c++)
      if (tokens[c] === undefined) throw new Error(`Table.${op}: token ${c} is undefined`);
    const lead = this._byToken.get(tokens[0]);
    if (lead === undefined) return undefined;
    const joins = this._joins;
    for (let c = 1; c < n; c++) {
      const set = this._byToken.get(tokens[c]);
      if (set === undefined) return undefined;
      joins[c] = set.column;
    }
    return lead;
  }

  /** Ids carrying every token; no tokens means every live id. BUG: closure-free, `c === n` in
   *  place of `.every()` (docs/GMRT.md #15549). */
  query(...tokens) {
    const n = tokens.length;
    if (n === 0) return this.ids.live();
    const lead = this._join(tokens, "query");
    if (lead === undefined) return [];
    const joins = this._joins;
    const result = [];
    const dense = lead.dense;
    const len = dense.length;
    const c0 = lead.column;
    const packed = this.ids.packed;
    for (let k = 0; k < len; k++) {
      const i = dense[k];
      if (c0[i] === undefined) continue;
      let c = 1;
      while (c < n && joins[c][i] !== undefined) c++;
      if (c === n) result.push(packed[i]);
    }
    return result;
  }

  /** First matching id in the lead's dense order, or -1 — `query(...)[0]` without the array, and
   *  the walk stops at the hit. */
  first(...tokens) {
    const n = tokens.length;
    const lead = this._join(tokens, "first");
    if (lead === undefined) return -1;
    const joins = this._joins;
    const dense = lead.dense;
    const len = dense.length;
    const c0 = lead.column;
    const packed = this.ids.packed;
    for (let k = 0; k < len; k++) {
      const i = dense[k];
      if (c0[i] === undefined) continue;
      let c = 1;
      while (c < n && joins[c][i] !== undefined) c++;
      if (c === n) return packed[i];
    }
    return -1;
  }

  /**
   * The allocation-free form of `query`, the one a per-tick system wants: the callback is handed
   * the data the walk already resolved, so the body pays no `get` per entity.
   *
   * `fn(id, data0, data1, data2, data3)` — data in token order, up to the fourth token; a fifth
   * or later token still gates the visit, but its data is read with `get`.
   *
   * Visits the lead's carriers as of the walk's start, minus those that lose the lead token
   * meanwhile; a callback may add, detach, walk, or queue a removal freely.
   */
  forEach(tokens, fn) {
    const n = tokens.length;
    const lead = this._join(tokens, "forEach");
    if (lead === undefined) return;
    if (n > 1) this._warnLead(tokens, lead);
    // a callback may walk again and overwrite `_joins`, so the columns move into locals first
    const joins = this._joins;
    const c1 = joins[1];
    const c2 = joins[2];
    const c3 = joins[3];
    const rest = n > 4 ? joins.slice(0, n) : undefined;

    const dense = lead.dense;
    const len = dense.length;
    const c0 = lead.column;
    const packed = this.ids.packed;
    lead.walking++;

    if (n === 1) {
      for (let k = 0; k < len; k++) {
        const i = dense[k];
        const d0 = c0[i];
        if (d0 !== undefined) fn(packed[i], d0);
      }
      this._settle(lead);
      return;
    }

    if (n === 2) {
      for (let k = 0; k < len; k++) {
        const i = dense[k];
        const d0 = c0[i];
        if (d0 === undefined) continue;
        const d1 = c1[i];
        if (d1 === undefined) continue;
        fn(packed[i], d0, d1);
      }
      this._settle(lead);
      return;
    }

    if (n === 3) {
      for (let k = 0; k < len; k++) {
        const i = dense[k];
        const d0 = c0[i];
        if (d0 === undefined) continue;
        const d1 = c1[i];
        if (d1 === undefined) continue;
        const d2 = c2[i];
        if (d2 === undefined) continue;
        fn(packed[i], d0, d1, d2);
      }
      this._settle(lead);
      return;
    }

    for (let k = 0; k < len; k++) {
      const i = dense[k];
      const d0 = c0[i];
      if (d0 === undefined) continue;
      const d1 = c1[i];
      if (d1 === undefined) continue;
      const d2 = c2[i];
      if (d2 === undefined) continue;
      const d3 = c3[i];
      if (d3 === undefined) continue;
      let c = 4;
      while (c < n && rest[c][i] !== undefined) c++;
      if (c === n) fn(packed[i], d0, d1, d2, d3);
    }
    this._settle(lead);
  }

  /**
   * `{ ids, components }`: per persistent token its `[index, data]` entries in dense order — the
   * shape `import` rebuilds from; a transient set is left out. A codec set's data is packed, and
   * the entry holds what `sink(token, index, buffer)` returns (a blob name — the sink owns the
   * buffer), or the buffer itself with no sink.
   */
  export(sink) {
    const components = {};
    for (let k = 0; k < this._tokens.length; k++) {
      const set = this._sets[k];
      if (set.transient) continue;
      const token = this._tokens[k];
      const dense = set.dense;
      const column = set.column;
      const codec = set.codec;
      const entries = [];
      for (let p = 0; p < dense.length; p++) {
        const i = dense[p];
        const data = column[i];
        if (data === undefined) continue;
        if (codec === undefined) {
          entries.push([i, data]);
          continue;
        }
        const buf = codec.pack(data);
        entries.push([i, sink === undefined ? buf : sink(token, i, buf)]);
      }
      components[token] = entries;
    }
    return { ids: this.ids.export(), components };
  }

  /**
   * Reclaim the dead rows of exports kept together, in place: each one's dead ids drop to the least
   * generation no number in any of their persisted data could name, so a row retired in play comes
   * back and a stale id the data keeps stays stale. A number counts against every store, since one
   * store's data may name another's rows; a codec blob is not read, so a codec datum holds no id.
   */
  static compact(snapshots) {
    let n = 0;
    for (let s = 0; s < snapshots.length; s++) n = Math.max(n, snapshots[s].ids.next);
    const floor = new Array(n).fill(0);
    for (let s = 0; s < snapshots.length; s++) {
      const components = snapshots[s].components;
      const toks = Object.keys(components);
      for (let t = 0; t < toks.length; t++) {
        const entries = components[toks[t]];
        for (let j = 0; j < entries.length; j++) Handle.scan(entries[j][1], floor);
      }
    }
    for (let s = 0; s < snapshots.length; s++) Handle.compact(snapshots[s].ids, floor);
  }

  /**
   * Replace the store whole with the snapshot's, so a queued removal is dropped with it; mid-walk
   * it throws, since a walk would run on rebuilt lists. A token the snapshot names that this store
   * never registered is registered on the way in (a fresh store restoring a whole export), so
   * nothing an export held is dropped. A codec set's entry is resolved through `source(value)`
   * (the blob under the name the sink gave; the buffer stays the source's to free) — the value
   * itself with no source — and unpacked last; an unpack returning undefined leaves the slot
   * empty.
   */
  import(snapshot, source) {
    if (this._walking()) throw new Error("Table.import: called mid-walk");
    this._pending = [];
    this.ids.import(snapshot.ids);
    const components = snapshot.components;
    const toks = Object.keys(components);
    for (let t = 0; t < toks.length; t++) this.register(toks[t]);
    const n = this._tokens.length; // the sets to replace — one an unpack registers is its own
    const late = [];
    for (let k = 0; k < n; k++) {
      const set = this._sets[k];
      this._release(set); // the store's data is replaced whole — its handles go first
      set.column.fill(undefined);
      set.sparse.fill(-1);
      set.dense.length = 0;
      set.walking = 0;
      set.pending.length = 0;
      const entries = components[this._tokens[k]];
      if (entries === undefined) continue;
      if (set.codec !== undefined) {
        late.push(k);
        continue;
      }
      for (let j = 0; j < entries.length; j++) {
        const i = entries[j][0];
        const data = entries[j][1];
        if (set.fill !== undefined) Table._fill(set, data);
        set.column[i] = data;
        set.sparse[i] = set.dense.length;
        set.dense.push(i);
      }
    }
    for (let q = 0; q < late.length; q++) {
      const k = late[q];
      const set = this._sets[k];
      const entries = components[this._tokens[k]];
      for (let j = 0; j < entries.length; j++) {
        const i = entries[j][0];
        const v = entries[j][1];
        const data = set.codec.unpack(source === undefined ? v : source(v));
        if (data === undefined) continue;
        if (set.fill !== undefined) Table._fill(set, data);
        set.column[i] = data;
        set.sparse[i] = set.dense.length;
        set.dense.push(i);
      }
    }
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

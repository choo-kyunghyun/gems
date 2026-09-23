/**
 * A Table's storage: one sparse set per registered token (SoA). Per token, `column[i]` is row
 * index i's data (`undefined` = absent, so `get`/`has` cost a column read), `dense` lists the
 * indices carrying the token, and `sparse[i]` is index i's position in `dense` (-1 = absent). A
 * walk runs down the LEAD token's dense list and joins the rest by column read, so the rarest
 * token should lead: it alone decides the walk's length.
 *
 * Order: a dense list is insertion order until a removal, which swap-removes, so walks run in an
 * order stable between mutations and otherwise unspecified — never by index. A carrier only ever
 * moves toward the front, so a forward position cursor reaches it.
 *
 * Removal safety: `detach`/`clear` empty the slot at once and, while a walk is on that token,
 * defer the swap-remove until the outermost walk ends, so a callback may detach the lead token
 * from any entity. A carrier added mid-walk is visited from the next walk.
 *
 * Persistence: a set is transient once its token is minted — rebuilt at runtime, so `export` and
 * `persistentOf` skip it. A mint may hand the set a release hook, `destroy(data)`, called as data
 * leaves its slot by any path, so a component holding a native handle frees it with no reap pass.
 *
 * A set may carry a binary codec (`pack(data)` → buffer, `unpack(buffer)` → data): its entries
 * cross `export`/`import` as buffers through the caller's sink and source, for what is dense and
 * what JSON can't carry (docs/GMRT.md #15565). An import fills the codec sets last, so an unpack
 * may read a record the same import restored.
 */
globalThis.Columns = class Columns {
  constructor(maxEntities, ids) {
    this.maxEntities = maxEntities;
    this.ids = ids;
    this._byToken = new Map();
    // BUG: iterate _tokens/_sets (the Map's mirror, registration order), never a Map iterator
    // (docs/GMRT.md #15095); the Map is only O(1) token lookup.
    this._tokens = [];
    this._sets = [];
  }

  destroy() {
    const sets = this._sets;
    for (let c = 0; c < sets.length; c++) this._release(sets[c]);
    this._byToken.clear();
    this._tokens = [];
    this._sets = [];
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

  register(token) {
    if (!this._byToken.has(token)) {
      const set = {
        column: new Array(this.maxEntities).fill(undefined),
        dense: [],
        sparse: new Array(this.maxEntities).fill(-1),
        walking: 0, // forEach nesting depth with this token as the lead
        pending: [], // indices whose swap-remove waits for the walk to end
        transient: false, // minted: skipped by export/persistentOf
        destroy: undefined, // release hook, called as data leaves a slot
        codec: undefined, // { pack, unpack }
      };
      this._byToken.set(token, set);
      this._tokens.push(token);
      this._sets.push(set);
    }
    return this;
  }

  add(id, token, data) {
    let set = this._byToken.get(token);
    if (set === undefined) {
      this.register(token);
      set = this._byToken.get(token);
    }
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
  }

  /** `add`, and mark the token transient: the caller rebuilds it at runtime, so no export
   *  carries it. `destroy(data)` is the set's release hook — one per token, the first mint's. */
  mint(id, token, data, destroy) {
    this.add(id, token, data);
    const set = this._byToken.get(token);
    set.transient = true;
    if (destroy !== undefined) if (set.destroy === undefined) set.destroy = destroy;
  }

  /** Give a token its binary codec — before the store is exported or imported. */
  codec(token, c) {
    this.register(token);
    this._byToken.get(token).codec = c;
  }

  get(id, token) {
    const set = this._byToken.get(token);
    if (set === undefined) return undefined;
    return set.column[id & Handle.INDEX_MASK];
  }

  /** The token's column, registered if new — a per-tick reader hoists it once and indexes it by
   *  `id & Handle.INDEX_MASK` in place of a `get` per entity, never holding it past the tick. */
  column(token) {
    this.register(token);
    return this._byToken.get(token).column;
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

  clear(index) {
    const sets = this._sets;
    for (let c = 0; c < sets.length; c++) {
      const set = sets[c];
      if (set.sparse[index] !== -1) this._drop(set, index);
    }
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

  /** BUG: closure-free, `c === n` in place of `.every()` (docs/GMRT.md #15549). */
  query(tokens) {
    const n = tokens.length;
    const lead = this._byToken.get(tokens[0]);
    if (lead === undefined) return [];
    const columns = new Array(n);
    for (let c = 1; c < n; c++) {
      const set = this._byToken.get(tokens[c]);
      if (set === undefined) return [];
      columns[c] = set.column;
    }

    const result = [];
    const dense = lead.dense;
    const len = dense.length;
    const c0 = lead.column;
    const packed = this.ids.packed;
    for (let k = 0; k < len; k++) {
      const i = dense[k];
      if (c0[i] === undefined) continue;
      let c = 1;
      while (c < n && columns[c][i] !== undefined) c++;
      if (c === n) result.push(packed[i]);
    }
    return result;
  }

  /** First matching id in the lead's dense order, or -1 — `query(...)[0]` without the array, and
   *  the walk stops at the hit. */
  first(tokens) {
    const n = tokens.length;
    const lead = this._byToken.get(tokens[0]);
    if (lead === undefined) return -1;
    const columns = new Array(n);
    for (let c = 1; c < n; c++) {
      const set = this._byToken.get(tokens[c]);
      if (set === undefined) return -1;
      columns[c] = set.column;
    }
    const dense = lead.dense;
    const len = dense.length;
    const c0 = lead.column;
    const packed = this.ids.packed;
    for (let k = 0; k < len; k++) {
      const i = dense[k];
      if (c0[i] === undefined) continue;
      let c = 1;
      while (c < n && columns[c][i] !== undefined) c++;
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
   * meanwhile; a callback may add, detach, or queue a removal freely.
   */
  forEach(tokens, fn) {
    const n = tokens.length;
    const lead = this._byToken.get(tokens[0]);
    if (lead === undefined) return;
    const columns = new Array(n);
    for (let c = 1; c < n; c++) {
      const set = this._byToken.get(tokens[c]);
      if (set === undefined) return;
      columns[c] = set.column;
    }

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

    const c1 = columns[1];
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

    const c2 = columns[2];
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

    const c3 = columns[3];
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
      while (c < n && columns[c][i] !== undefined) c++;
      if (c === n) fn(packed[i], d0, d1, d2, d3);
    }
    this._settle(lead);
  }

  /** Per persistent token its `[index, data]` entries in dense order — the shape `import`
   *  rebuilds from; a transient set is left out. A codec set's data is packed, and the entry
   *  holds what `sink(token, index, buffer)` returns (a blob name — the sink owns the buffer), or
   *  the buffer itself with no sink. */
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
    return components;
  }

  /**
   * Replace every set with the snapshot's. A token the snapshot names that this store never
   * registered is registered on the way in (a fresh store restoring a whole export), so nothing
   * an export held is dropped. A codec set's entry is resolved through `source(value)` (the blob
   * under the name the sink gave; the buffer stays the source's to free) — the value itself with
   * no source — and unpacked last; an unpack returning undefined leaves the slot empty.
   */
  import(components, source) {
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
        set.column[i] = entries[j][1];
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
        set.column[i] = data;
        set.sparse[i] = set.dense.length;
        set.dense.push(i);
      }
    }
  }
};

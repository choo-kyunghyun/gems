/**
 * A Table's storage: one SPARSE SET per registered token (SoA). Per token: `column[i]` is the data of row index i
 * (`undefined` = absent — presence stays a plain slot test, so `get`/`has` cost a column read),
 * `dense` lists the indices carrying the token, and `sparse[i]` is index i's position in `dense`
 * (-1 = absent). A walk runs down the LEAD token's dense list and joins the rest by column read,
 * so it visits the lead's carriers and never the index space: the lead token is the contract —
 * the rarest token leads, since it alone decides the walk's length (testData perf.layout).
 *
 * Order: a dense list is insertion order until a removal, which swap-removes (the last carrier
 * takes the hole), so `query`/`first`/`forEach` run in an order that is stable between mutations
 * and otherwise unspecified — never by index. Fairness over that order is a POSITION cursor
 * (PathfindingSystem): a carrier only ever moves toward the front, so a forward sweep reaches it.
 *
 * Removal safety: `detach`/`clear` empty the column slot at once (`get`/`has` read it immediately)
 * and, while a walk is on that token, defer the swap-remove until the outermost such walk ends —
 * the walk skips the emptied slot by its column read, so a callback may detach the lead token
 * from ANY entity. A carrier added mid-walk lands past the walk's end and is visited from the
 * next walk. Entity removal stays deferred (Table.remove).
 *
 * Persistence: a set is TRANSIENT once its token is minted (`mint`) — runtime-rebuilt by the
 * minting system, so `export` and `persistentOf` skip it, and a later `add` keeps it so. The mint
 * site owns that fact; no consumer names a transient token by hand. A mint may also hand the set
 * its RELEASE hook — `destroy(data)`, called as the data leaves its slot (a detach, the entity's
 * clear at flush, a replacing add, an import over the store, the store's destroy) — so a
 * component holding a native handle (a Puppet instance, a particle system) frees it with no
 * roster and no reap pass.
 *
 * A set may carry a binary CODEC (`codec`) — `pack(data)` → a buffer, `unpack(buffer)` → data:
 * its entries cross `export`/`import` as buffers through the caller's sink and source (a name
 * in the JSON, the bytes in a blob), the channel for what is dense (a tile grid) and JSON on this
 * runtime can't carry (docs/GMRT.md #15565). An import fills the codec sets LAST, so an unpack
 * may read a record the same import restored.
 */
globalThis.Columns = class Columns {
  constructor(maxEntities, ids) {
    this.maxEntities = maxEntities;
    this.ids = ids;
    this._byToken = new Map();
    // #15095: iterate _tokens/_sets (Map mirror, registration order), never a Map iterator;
    // the Map is only O(1) token lookup.
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
        transient: false, // minted — skipped by export/persistentOf
        destroy: undefined, // a transient token's release hook (mint), called as data leaves a slot
        codec: undefined, // { pack, unpack } — the set's entries cross an export as buffers (codec)
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
    const i = Handle.index(id);
    if (set.destroy !== undefined) {
      const prev = set.column[i];
      if (prev !== undefined) if (prev !== data) set.destroy(prev); // replaced: the old handle goes
    }
    set.column[i] = data;
    if (set.sparse[i] === -1) {
      set.sparse[i] = set.dense.length;
      set.dense.push(i);
    }
  }

  /** `add`, and mark the token transient: the caller rebuilds it at runtime, so no export
   *  carries it. `destroy(data)`, when given, is the set's release hook (header) — one per token,
   *  the first mint's. */
  mint(id, token, data, destroy) {
    this.add(id, token, data);
    const set = this._byToken.get(token);
    set.transient = true;
    if (destroy !== undefined) if (set.destroy === undefined) set.destroy = destroy;
  }

  /** Give a token its binary codec (header) — registered before the store is exported or imported. */
  codec(token, c) {
    this.register(token);
    this._byToken.get(token).codec = c;
  }

  get(id, token) {
    const set = this._byToken.get(token);
    if (set === undefined) return undefined;
    return set.column[Handle.index(id)];
  }

  /** The token's column, registered if new — a per-tick reader hoists it once and indexes it by
   *  `id & Handle.INDEX_MASK` in place of a `get` per entity (testRuntime perf.measured
   *  store.get.cached), never holding it past the tick. */
  column(token) {
    this.register(token);
    return this._byToken.get(token).column;
  }

  /** The component the caller's contract requires — throws on a miss (an unregistered token
   *  included), where `get` reads undefined for a component whose absence is a state. */
  require(id, token) {
    const set = this._byToken.get(token);
    const data = set === undefined ? undefined : set.column[Handle.index(id)];
    if (data === undefined)
      throw new Error(`entity ${id} carries no ${token}`);
    return data;
  }

  /** No `&&`: a short-circuit corrupts its left operand on this runtime (GMRT.md #15549). */
  has(id, token) {
    const set = this._byToken.get(token);
    if (set === undefined) return false;
    return set.column[Handle.index(id)] !== undefined;
  }

  detach(id, token) {
    const set = this._byToken.get(token);
    if (set !== undefined) this._drop(set, Handle.index(id));
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
    const i = Handle.index(id);
    for (let c = 0; c < this._tokens.length; c++) {
      const set = this._sets[c];
      // comparisons as the operands: a bare flag on the left of && is clobbered (#15549)
      if (skipTransient === true && set.transient === true) continue;
      const data = set.column[i];
      if (data !== undefined) out[this._tokens[c]] = data;
    }
    return out;
  }

  /** Closure-free: `c === n` stands in for `.every()` to avoid the GMRT boolean-local clobber. */
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
   * The allocation-free counterpart to `query`, and the form a per-tick system wants: no
   * result array, and the callback is handed the component data the walk ALREADY resolved,
   * so the loop body pays no `get` per entity (testData perf.layout, `query.get`).
   *
   * `fn(id, data0, data1, data2, data3)` — data in token order, up to the FOURTH token;
   * a match on a fifth or later token still gates the visit, but read its data with `get`
   * (nothing in the project queries more than four).
   *
   * Visits the lead's carriers as of the walk's start, minus those that lose the lead token
   * meanwhile (the header's removal-safety contract); a callback may add, detach, or queue a
   * removal freely.
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
   * no source — and unpacked last (header); an unpack returning undefined leaves the slot empty.
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

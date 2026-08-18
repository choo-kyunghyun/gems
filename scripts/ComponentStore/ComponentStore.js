// One COLUMN per registered token (a dense array indexed by entity index, SoA): an `undefined`
// slot means the entity lacks that component, which is what makes presence a plain slot test.
globalThis.ComponentStore = class ComponentStore {
  constructor(maxEntities, ids) {
    this.maxEntities = maxEntities;
    this.ids = ids;
    this._byToken = new Map();
    // #15095: iterate _tokens/_columns (Map mirror, registration order), never a Map iterator;
    // the Map is only O(1) token lookup.
    this._tokens = [];
    this._columns = [];
  }

  destroy() {
    this._byToken.clear();
    this._tokens = [];
    this._columns = [];
  }

  register(token) {
    if (!this._byToken.has(token)) {
      const column = new Array(this.maxEntities).fill(undefined);
      this._byToken.set(token, column);
      this._tokens.push(token);
      this._columns.push(column);
    }
    return this;
  }

  add(id, token, data) {
    if (!this._byToken.has(token)) this.register(token);
    this._byToken.get(token)[EntityID.index(id)] = data;
  }

  get(id, token) {
    const column = this._byToken.get(token);
    if (column === undefined) return undefined;
    return column[EntityID.index(id)];
  }

  /** No `&&`: a short-circuit corrupts its left operand on this runtime (GMRT.md #15549). */
  has(id, token) {
    const column = this._byToken.get(token);
    if (column === undefined) return false;
    return column[EntityID.index(id)] !== undefined;
  }

  detach(id, token) {
    const column = this._byToken.get(token);
    if (column !== undefined) column[EntityID.index(id)] = undefined;
  }

  clear(index) {
    for (let c = 0; c < this._columns.length; c++)
      this._columns[c][index] = undefined;
  }

  componentsOf(id) {
    const out = {};
    const i = EntityID.index(id);
    for (let c = 0; c < this._tokens.length; c++) {
      const data = this._columns[c][i];
      if (data !== undefined) out[this._tokens[c]] = data;
    }
    return out;
  }

  /** Closure-free: `c === n` stands in for `.every()` to avoid the GMRT boolean-local clobber. */
  query(tokens) {
    const n = tokens.length;
    const columns = new Array(n);
    for (let c = 0; c < n; c++) {
      const col = this._byToken.get(tokens[c]);
      if (col === undefined) return [];
      columns[c] = col;
    }

    const result = [];
    const hi = this.ids.next;
    const packed = this.ids.packed;
    for (let i = 0; i < hi; i++) {
      let c = 0;
      while (c < n && columns[c][i] !== undefined) c++;
      if (c === n) result.push(packed[i]);
    }
    return result;
  }

  /** First matching id by ascending index, or -1 — `query(...)[0]` without the array, and the
   *  scan stops at the hit. */
  first(tokens) {
    const n = tokens.length;
    const columns = new Array(n);
    for (let c = 0; c < n; c++) {
      const col = this._byToken.get(tokens[c]);
      if (col === undefined) return -1;
      columns[c] = col;
    }
    const hi = this.ids.next;
    const packed = this.ids.packed;
    for (let i = 0; i < hi; i++) {
      let c = 0;
      while (c < n && columns[c][i] !== undefined) c++;
      if (c === n) return packed[i];
    }
    return -1;
  }

  /**
   * The allocation-free counterpart to `query`, and the form a per-tick system wants: no
   * result array, and the callback is handed the component data the scan ALREADY resolved,
   * so the loop body pays no `get` per entity — together ~9x `query` + `get` (docs/PERF.md).
   *
   * `fn(id, data0, data1, data2, data3)` — data in token order, up to the FOURTH token;
   * a match on a fifth or later token still gates the visit, but read its data with `get`
   * (nothing in the project queries more than four).
   *
   * Removal stays deferred (EntityStore.remove), so a callback may remove while iterating;
   * ADDING a component mid-iteration is not defined — the columns are captured up front and
   * the scan is by ascending index.
   */
  forEach(tokens, fn) {
    const n = tokens.length;
    const columns = new Array(n);
    for (let c = 0; c < n; c++) {
      const col = this._byToken.get(tokens[c]);
      if (col === undefined) return;
      columns[c] = col;
    }

    const hi = this.ids.next;
    const packed = this.ids.packed;
    const c0 = columns[0];

    if (n === 1) {
      for (let i = 0; i < hi; i++) {
        const d0 = c0[i];
        if (d0 !== undefined) fn(packed[i], d0);
      }
      return;
    }

    const c1 = columns[1];
    if (n === 2) {
      for (let i = 0; i < hi; i++) {
        const d0 = c0[i];
        if (d0 === undefined) continue;
        const d1 = c1[i];
        if (d1 === undefined) continue;
        fn(packed[i], d0, d1);
      }
      return;
    }

    const c2 = columns[2];
    if (n === 3) {
      for (let i = 0; i < hi; i++) {
        const d0 = c0[i];
        if (d0 === undefined) continue;
        const d1 = c1[i];
        if (d1 === undefined) continue;
        const d2 = c2[i];
        if (d2 === undefined) continue;
        fn(packed[i], d0, d1, d2);
      }
      return;
    }

    const c3 = columns[3];
    for (let i = 0; i < hi; i++) {
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
  }

  export() {
    const components = {};
    for (let k = 0; k < this._tokens.length; k++) {
      const column = this._columns[k];
      const entries = [];
      for (let i = 0; i < column.length; i++) {
        if (column[i] !== undefined) entries.push([i, column[i]]);
      }
      components[this._tokens[k]] = entries;
    }
    return components;
  }

  /** Unknown component keys are ignored. */
  import(components) {
    for (let k = 0; k < this._tokens.length; k++) {
      const column = this._columns[k];
      column.fill(undefined);
      const entries = components[this._tokens[k]];
      if (entries === undefined) continue;
      for (let j = 0; j < entries.length; j++) {
        column[entries[j][0]] = entries[j][1];
      }
    }
  }
};

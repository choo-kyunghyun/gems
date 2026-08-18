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
    const gens = this.ids.generations;
    for (let i = 0; i < hi; i++) {
      let c = 0;
      while (c < n && columns[c][i] !== undefined) c++;
      if (c === n) result.push(EntityID.make(i, gens[i]));
    }
    return result;
  }

  forEach(tokens, fn) {
    const n = tokens.length;
    const columns = new Array(n);
    for (let c = 0; c < n; c++) {
      const col = this._byToken.get(tokens[c]);
      if (col === undefined) return;
      columns[c] = col;
    }

    const hi = this.ids.next;
    const gens = this.ids.generations;
    for (let i = 0; i < hi; i++) {
      let c = 0;
      while (c < n && columns[c][i] !== undefined) c++;
      if (c === n) fn(EntityID.make(i, gens[i]));
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

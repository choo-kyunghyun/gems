/**
 * A row handle — index (20 bits) plus generation (12 bits) packed into one number — and the
 * allocator that hands them out: a freed index comes back at the next generation, so a stale
 * handle fails `isValid` instead of naming the slot's new owner, and an index whose generation
 * would wrap is retired, handed out again only once a compaction finds no id of it kept. The
 * static half packs, unpacks and compacts; the instance half is an allocation table.
 */
globalThis.Handle = class Handle {
  static INDEX_BITS = 20;
  // BUG: a literal, not INDEX_BITS (docs/GMRT.md) — keep the two in sync by hand.
  static INDEX_MASK = (1 << 20) - 1;
  static GENERATION_MASK = 0xfff;
  /** A retired index's generation — past the mask, so no handle carries it. */
  static RETIRED = 0x1000;

  static make(index, generation) {
    return (generation << this.INDEX_BITS) | index;
  }

  static index(id) {
    return id & this.INDEX_MASK;
  }

  static generation(id) {
    return id >>> this.INDEX_BITS;
  }

  constructor(maxEntities) {
    this.generations = new Uint16Array(maxEntities);
    /**
     * The id each index hands out at its current generation: a mirror of `generations` so a
     * query emits an id by one plain-array read, a typed-array read costing ~20x on this runtime.
     * A freed index holds its next owner's id, which no query can reach, since component slots
     * are cleared before the id is freed.
     * TODO retire the mirror when a typed-array read costs what a plain one does.
     */
    this.packed = new Array(maxEntities);
    this.freeIndices = [];
    this.next = 0;
    this.retired = 0;
    this._repack();
  }

  alloc() {
    let index;
    if (this.freeIndices.length > 0) {
      index = this.freeIndices.pop();
    } else {
      if (this.next === this.packed.length)
        throw new Error(`Handle.alloc: all ${this.next} slots in use`);
      index = this.next++;
      this.generations[index] = 0;
      this.packed[index] = index; // generation 0
    }
    return this.packed[index];
  }

  free(id) {
    const index = Handle.index(id);
    const generation = Handle.generation(id);
    if (this.generations[index] !== generation) return false;
    if (generation === Handle.GENERATION_MASK) {
      this.generations[index] = Handle.RETIRED;
      this.retired++;
      return true;
    }
    const bumped = generation + 1;
    this.generations[index] = bumped;
    this.packed[index] = Handle.make(index, bumped);
    this.freeIndices.push(index);
    return true;
  }

  count() {
    return this.next - this.freeIndices.length - this.retired;
  }

  isValid(id) {
    const index = Handle.index(id);
    const generation = Handle.generation(id);
    return this.generations[index] === generation;
  }

  /**
   * Every live id, ascending by index — the token-less whole-store query. Liveness is the free
   * list and the retired mark, not a generation test: a freed index's `packed` entry is its NEXT
   * owner's id, which passes `isValid`.
   */
  live() {
    const hi = this.next;
    const free = new Array(hi).fill(false);
    const fi = this.freeIndices;
    for (let k = 0; k < fi.length; k++) free[fi[k]] = true;
    const g = this.generations;
    const out = [];
    for (let i = 0; i < hi; i++)
      if (!free[i]) if (g[i] !== Handle.RETIRED) out.push(this.packed[i]);
    return out;
  }

  reset() {
    // BUG: the range is explicit (docs/GMRT.md).
    this.generations.fill(0, 0, this.generations.length);
    this.freeIndices = [];
    this.next = 0;
    this._repack();
  }

  /** Required after any bulk write to `generations`. */
  _repack() {
    const g = this.generations;
    const p = this.packed;
    let retired = 0;
    for (let i = 0; i < p.length; i++) {
      p[i] = Handle.make(i, g[i]);
      if (g[i] === Handle.RETIRED) retired++;
    }
    this.retired = retired;
  }

  export() {
    return {
      generations: Array.from(this.generations),
      freeIndices: [...this.freeIndices],
      next: this.next,
    };
  }

  import(data) {
    this.generations.set(data.generations);
    this.freeIndices = data.freeIndices;
    this.next = data.next;
    this._repack();
  }

  /**
   * Drop the dead indices of an `export()` record, in place, to the least generation `floor`
   * allows (it spans the record's indices), never raising one, so a retired index whose floor
   * fits comes back free. A live index keeps its generation: its id is in use.
   */
  static compact(data, floor) {
    const g = data.generations;
    const free = data.freeIndices;
    for (let k = 0; k < free.length; k++) {
      const i = free[k];
      g[i] = Math.min(g[i], floor[i]);
    }
    for (let i = 0; i < data.next; i++) {
      if (g[i] !== Handle.RETIRED) continue;
      if (floor[i] > Handle.GENERATION_MASK) continue;
      g[i] = floor[i];
      free.push(i);
    }
  }

  /**
   * Raise `floor[i]` past the generation of every number in `value` that could be a handle to
   * index i — plain data, walked through arrays, object literals and their keys. The test is the
   * number's shape alone, so a coincidence only raises a floor.
   */
  static scan(value, floor) {
    Handle._scan(value, floor, []);
  }

  static _scan(v, floor, path) {
    if (typeof v === "number") {
      Handle._mark(v, floor);
      return;
    }
    if (v === null || typeof v !== "object") return;
    // an identity scan, not an object-keyed Set (docs/GMRT.md #15567)
    for (let i = 0; i < path.length; i++) if (path[i] === v) return;
    if (Array.isArray(v)) {
      path.push(v);
      for (let i = 0; i < v.length; i++) Handle._scan(v[i], floor, path);
      path.pop();
      return;
    }
    if (v.constructor !== Object) return; // an asset ref
    path.push(v);
    for (const k in v) {
      Handle._mark(Number(k), floor);
      Handle._scan(v[k], floor, path);
    }
    path.pop();
  }

  static _mark(n, floor) {
    if (!Number.isInteger(n)) return;
    // a handle is an int32, and a bitwise op collapses anything past it (docs/GMRT.md)
    if (n < -2147483648) return;
    if (n > 2147483647) return;
    const i = n & Handle.INDEX_MASK;
    if (i >= floor.length) return;
    const past = (n >>> Handle.INDEX_BITS) + 1;
    if (past > floor[i]) floor[i] = past;
  }
};

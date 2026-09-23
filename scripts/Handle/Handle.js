/**
 * A row handle — index (20 bits) plus generation (12 bits) packed into one number — and the
 * allocator that hands them out: a freed index comes back at the next generation, so a stale
 * handle fails `isValid` instead of naming the slot's new owner, and an index whose generation
 * would wrap is retired, never handed out again. The static half packs and unpacks a handle; the
 * instance half is an allocation table.
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
};

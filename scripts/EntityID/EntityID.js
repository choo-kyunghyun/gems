globalThis.EntityID = class EntityID {
  static INDEX_BITS = 20;
  // Literal 20, not (1 << INDEX_BITS): GMRT static field initializers can't reference the
  // class's own name — keep the two in sync by hand.
  static INDEX_MASK = (1 << 20) - 1;
  static GENERATION_MASK = 0xfff;

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
     * packed[index] = the id `alloc()` hands out for that index at its CURRENT generation.
     * A derived mirror of `generations` (rebuilt by _repack), kept so a query can emit an id
     * by one plain-array read instead of recomposing make(index, generation) per match — a
     * typed-array read costs ~20x a plain one here (docs/PERF.md), and this sits on every
     * matched entity of every query. A freed index holds the id its NEXT owner will get,
     * which no query can reach: flush() clears the component slots before freeing the id.
     */
    this.packed = new Array(maxEntities);
    this.freeIndices = [];
    this.next = 0;
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
    const index = EntityID.index(id);
    const generation = EntityID.generation(id);
    if (this.generations[index] !== generation) return false;
    const bumped = (generation + 1) & EntityID.GENERATION_MASK;
    this.generations[index] = bumped;
    this.packed[index] = EntityID.make(index, bumped);
    this.freeIndices.push(index);
    return true;
  }

  count() {
    return this.next - this.freeIndices.length;
  }

  isValid(id) {
    const index = EntityID.index(id);
    const generation = EntityID.generation(id);
    return this.generations[index] === generation;
  }

  reset() {
    // Range is explicit: a typed array's fill() is a silent no-op without it (GMRT.md).
    this.generations.fill(0, 0, this.generations.length);
    this.freeIndices = [];
    this.next = 0;
    this._repack();
  }

  /** Re-derive `packed` from `generations` — after any BULK write to the generation table. */
  _repack() {
    const g = this.generations;
    const p = this.packed;
    for (let i = 0; i < p.length; i++) p[i] = EntityID.make(i, g[i]);
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

// Generational entity-id allocator owned by World as `world.ids`. An id packs a slot index
// (low 20 bits) + a generation counter (high 12 bits); freeing a slot bumps its generation so
// a stale id from a recycled slot fails isValid(). Freed indices are reused LIFO to keep the
// high-water mark (`next`) low.
globalThis.IdPool = class IdPool {
  static INDEX_BITS = 20;
  // Literal 20, not (1 << INDEX_BITS): a static field initializer can't reference the class's
  // own name yet (GMRT) — keep the two in sync by hand.
  static INDEX_MASK = (1 << 20) - 1;
  static GENERATION_MASK = 0xfff;

  /** Pack a slot index + generation into a single id. @param {number} index @param {number} generation @returns {number} */
  static makeId(index, generation) {
    return (generation << this.INDEX_BITS) | index;
  }

  /** @param {number} id @returns {number} the slot index */
  static getIndex(id) {
    return id & this.INDEX_MASK;
  }

  /** @param {number} id @returns {number} the generation */
  static getGeneration(id) {
    return id >>> this.INDEX_BITS;
  }

  /** @param {number} maxEntities slot capacity (sizes the generation table) */
  constructor(maxEntities) {
    this.generations = new Uint16Array(maxEntities);
    this.freeIndices = [];
    this.next = 0;
  }

  /** Allocate an id, reusing a freed slot if one exists. @returns {number} */
  alloc() {
    let index, generation;
    if (this.freeIndices.length > 0) {
      index = this.freeIndices.pop();
      generation = this.generations[index];
    } else {
      index = this.next++;
      generation = 0;
      this.generations[index] = generation;
    }
    return IdPool.makeId(index, generation);
  }

  /**
   * Free an id's slot, bumping its generation so the id can't be reused. No-op (returns false)
   * for an already-stale id. @param {number} id @returns {boolean} whether the id was live
   */
  free(id) {
    const index = IdPool.getIndex(id);
    const generation = IdPool.getGeneration(id);
    if (this.generations[index] !== generation) return false;
    this.generations[index] =
      (this.generations[index] + 1) & IdPool.GENERATION_MASK;
    this.freeIndices.push(index);
    return true;
  }

  /** @param {number} id @returns {boolean} whether the id's generation still matches its slot */
  isValid(id) {
    const index = IdPool.getIndex(id);
    const generation = IdPool.getGeneration(id);
    return this.generations[index] === generation;
  }

  /** Clear all allocations and generations back to empty. */
  reset() {
    this.generations.fill(0);
    this.freeIndices = [];
    this.next = 0;
  }

  /** @returns {{generations:number[], freeIndices:number[], next:number}} a plain serializable snapshot */
  export() {
    return {
      generations: Array.from(this.generations),
      freeIndices: [...this.freeIndices],
      next: this.next,
    };
  }

  /** Restore from an export() snapshot. @param {{generations:number[], freeIndices:number[], next:number}} data */
  import(data) {
    this.generations.set(data.generations);
    this.freeIndices = data.freeIndices;
    this.next = data.next;
  }
};

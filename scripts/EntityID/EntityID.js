// Generational id allocator. An id packs slot index (low 20 bits) + generation (high 12 bits);
// freeing bumps the generation so stale ids fail isValid(). LIFO reuse keeps `next` low.
globalThis.EntityID = class EntityID {
  static INDEX_BITS = 20;
  // Literal 20, not (1 << INDEX_BITS): GMRT static field initializers can't reference the
  // class's own name — keep the two in sync by hand.
  static INDEX_MASK = (1 << 20) - 1;
  static GENERATION_MASK = 0xfff;

  /** @param {number} index @param {number} generation @returns {number} packed id */
  static makeId(index, generation) {
    return (generation << this.INDEX_BITS) | index;
  }

  /** @param {number} id @returns {number} slot index */
  static getIndex(id) {
    return id & this.INDEX_MASK;
  }

  /** @param {number} id @returns {number} generation */
  static getGeneration(id) {
    return id >>> this.INDEX_BITS;
  }

  /** @param {number} maxEntities sizes the generation table */
  constructor(maxEntities) {
    this.generations = new Uint16Array(maxEntities);
    this.freeIndices = [];
    this.next = 0;
  }

  /** @returns {number} new id (reuses freed slot if available) */
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
    return EntityID.makeId(index, generation);
  }

  /** Free a slot, bumping its generation. No-op for a stale id. @param {number} id @returns {boolean} was live */
  free(id) {
    const index = EntityID.getIndex(id);
    const generation = EntityID.getGeneration(id);
    if (this.generations[index] !== generation) return false;
    this.generations[index] =
      (this.generations[index] + 1) & EntityID.GENERATION_MASK;
    this.freeIndices.push(index);
    return true;
  }

  /** @param {number} id @returns {boolean} generation matches slot (id is live) */
  isValid(id) {
    const index = EntityID.getIndex(id);
    const generation = EntityID.getGeneration(id);
    return this.generations[index] === generation;
  }

  /** Reset to empty. */
  reset() {
    this.generations.fill(0);
    this.freeIndices = [];
    this.next = 0;
  }

  /** @returns {{generations:number[], freeIndices:number[], next:number}} */
  export() {
    return {
      generations: Array.from(this.generations),
      freeIndices: [...this.freeIndices],
      next: this.next,
    };
  }

  /** @param {{generations:number[], freeIndices:number[], next:number}} data */
  import(data) {
    this.generations.set(data.generations);
    this.freeIndices = data.freeIndices;
    this.next = data.next;
  }
};

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
    this.freeIndices = [];
    this.next = 0;
  }

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
    return EntityID.make(index, generation);
  }

  free(id) {
    const index = EntityID.index(id);
    const generation = EntityID.generation(id);
    if (this.generations[index] !== generation) return false;
    this.generations[index] =
      (this.generations[index] + 1) & EntityID.GENERATION_MASK;
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
    this.generations.fill(0);
    this.freeIndices = [];
    this.next = 0;
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
  }
};

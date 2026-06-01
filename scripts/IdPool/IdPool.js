globalThis.IdPool = class IdPool {
  static INDEX_BITS = 20;
  static INDEX_MASK = (1 << 20) - 1;
  static GENERATION_MASK = 0xfff;

  static makeId(index, generation) {
    return (generation << this.INDEX_BITS) | index;
  }

  static getIndex(id) {
    return id & this.INDEX_MASK;
  }

  static getGeneration(id) {
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
    return IdPool.makeId(index, generation);
  }

  free(id) {
    const index = IdPool.getIndex(id);
    const generation = IdPool.getGeneration(id);
    if (this.generations[index] !== generation) return false;
    this.generations[index] =
      (this.generations[index] + 1) & IdPool.GENERATION_MASK;
    this.freeIndices.push(index);
    return true;
  }

  isValid(id) {
    const index = IdPool.getIndex(id);
    const generation = IdPool.getGeneration(id);
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

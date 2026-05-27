globalThis.IdPool = class IdPool {
  static INDEX_BITS = 20;
  static INDEX_MASK = (1 << this.INDEX_BITS) - 1;
  static GENERATION_MASK = 0xfff;

  static generations = new Uint16Array(MAX_ENTITIES);
  static freeIndices = [];
  static next = 0;

  static export() {
    return {
      generations: Array.from(this.generations),
      freeIndices: this.freeIndices,
      next: this.next,
    };
  }

  static import(data) {
    this.generations.set(data.generations);
    this.freeIndices = data.freeIndices;
    this.next = data.next;
  }

  static destroy() {
    this.generations.fill(0);
    this.freeIndices = [];
    this.next = 0;
  }

  static makeId(index, generation) {
    return (generation << this.INDEX_BITS) | index;
  }

  static getIndex(id) {
    return id & this.INDEX_MASK;
  }

  static getGeneration(id) {
    return id >>> this.INDEX_BITS;
  }

  static alloc() {
    let index;
    let generation;

    if (this.freeIndices.length > 0) {
      index = this.freeIndices.pop();
      generation = this.generations[index];
    } else {
      index = this.next++;
      generation = 0;
      this.generations[index] = generation;
    }

    return this.makeId(index, generation);
  }

  static free(id) {
    const index = this.getIndex(id);
    const generation = this.getGeneration(id);

    if (this.generations[index] !== generation) {
      return false;
    }

    this.generations[index] =
      (this.generations[index] + 1) & this.GENERATION_MASK;

    this.freeIndices.push(index);
    return true;
  }

  static isValid(id) {
    const index = this.getIndex(id);
    const generation = this.getGeneration(id);
    return this.generations[index] === generation;
  }
};

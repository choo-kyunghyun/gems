globalThis.IdPool = class IdPool {
  constructor(maximum = 10000) {
    this.INDEX_BITS = 20;
    this.INDEX_MASK = (1 << this.INDEX_BITS) - 1;
    this.GENERATION_MASK = 0xfff;

    this.generations = new Uint16Array(maximum);
    this.freeIndices = [];
    this.next = 0;
  }

  export() {
    return {
      generations: Array.from(this.generations),
      freeIndices: this.freeIndices,
      next: this.next,
    };
  }

  import(data) {
    this.generations.set(data.generations);
    this.freeIndices = data.freeIndices;
    this.next = data.next;
  }

  destroy() {
    this.generations.fill(0);
    this.freeIndices = [];
    this.next = 0;
  }

  _makeId(index, generation) {
    return (generation << this.INDEX_BITS) | index;
  }

    // static
  getIndex(id) {
    return id & this.INDEX_MASK;
  }

    // static
  getGeneration(id) {
    return id >>> this.INDEX_BITS;
  }

  alloc() {
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

    return this._makeId(index, generation);
  }

  free(id) {
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

  isValid(id) {
    const index = this.getIndex(id);
    const generation = this.getGeneration(id);
    return this.generations[index] === generation;
  }
};

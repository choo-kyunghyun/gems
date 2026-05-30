globalThis.Lifetime = class Lifetime {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  // steps: remaining steps before the entity is removed
  static set(id, steps) {
    this.data[IdPool.getIndex(id)] = { steps };
  }

  static fromDef(id, def) {
    this.set(id, def.steps);
  }

  static update() {
    for (let i = 0; i < this.data.length; i++) {
      const lt = this.data[i];
      if (lt === undefined) continue;
      lt.steps -= 1;
      if (lt.steps <= 0) {
        Entity.remove(IdPool.makeId(i, IdPool.generations[i]));
      }
    }
  }

  static delete(i) { this.data[i] = undefined; }

  static export() {
    const entries = [];
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] !== undefined) entries.push([i, this.data[i]]);
    }
    return entries;
  }

  static import(data) {
    this.data.fill(undefined);
    for (const [i, v] of data) this.data[i] = v;
  }
};

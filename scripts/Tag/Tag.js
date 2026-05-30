globalThis.Tag = class Tag {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, ...tags) {
    this.data[IdPool.getIndex(id)] = new Set(tags);
  }

  static add(id, tag) {
    this.data[IdPool.getIndex(id)].add(tag);
  }

  static remove(id, tag) {
    this.data[IdPool.getIndex(id)].delete(tag);
  }

  static hasTag(id, tag) {
    const tags = this.data[IdPool.getIndex(id)];
    return tags !== undefined && tags.has(tag);
  }

  static fromDef(id, def) {
    this.data[IdPool.getIndex(id)] = new Set(def.tags);
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

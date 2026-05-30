/// @deprecated
globalThis.Component = class Component {
  static data = [];

  static has(id) {
    return this.data[IdPool.getIndex(id)] !== undefined;
  }

  static delete(id) {
    this.data[IdPool.getIndex(id)] = undefined;
  }

  static get(id) {
    return this.data[IdPool.getIndex(id)];
  }

  static export() {
    const entries = [];
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] !== undefined) entries.push([i, this.data[i]]);
    }
    return entries;
  }

  static import(data) {
    this.data.fill(undefined);
    for (const [i, v] of data) {
      this.data[i] = v;
    }
  }
};

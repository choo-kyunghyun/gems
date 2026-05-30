globalThis.PathRequest = class PathRequest {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, sx, sy, gx, gy) {
    this.data[IdPool.getIndex(id)] = { sx, sy, gx, gy };
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

globalThis.PathCursor = class PathCursor {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static current(id) {
    const index = IdPool.getIndex(id);
    const cursor = this.data[index];
    if (cursor === undefined) return undefined;
    const path = PathResponse.data[index];
    if (path === undefined) return undefined;
    return path[cursor];
  }

  static advance(id) {
    const index = IdPool.getIndex(id);
    const cursor = this.data[index];
    if (cursor === undefined) return false;
    const path = PathResponse.data[index];
    if (path === undefined) return false;
    const next = cursor + 1;
    if (next >= path.length) {
      this.data[index] = undefined;
      PathResponse.data[index] = undefined;
      return false;
    }
    this.data[index] = next;
    return true;
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

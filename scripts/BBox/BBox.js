globalThis.BBox = class BBox {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, x, y, w, h) {
    this.data[IdPool.getIndex(id)] = { x, y, w, h };
  }

  static getWorld(id) {
    const bbox = this.data[IdPool.getIndex(id)];
    const pos = Position.get(id);
    return {
      x1: pos.x + bbox.x,
      y1: pos.y + bbox.y,
      x2: pos.x + bbox.x + bbox.w,
      y2: pos.y + bbox.y + bbox.h,
    };
  }

  static fromDef(id, def) {
    this.set(id, def.x ?? 0, def.y ?? 0, def.w, def.h);
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

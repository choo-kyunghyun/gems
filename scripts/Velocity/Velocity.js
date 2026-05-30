globalThis.Velocity = class Velocity {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, vx, vy, vz = 0, friction = 1) {
    this.data[IdPool.getIndex(id)] = { vx, vy, vz, friction };
  }

  static fromDef(id, def) {
    this.set(id, def.vx ?? 0, def.vy ?? 0, def.vz ?? 0, def.friction ?? 1);
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

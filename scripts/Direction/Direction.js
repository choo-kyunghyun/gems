globalThis.Direction = class Direction {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  // angle: facing angle in radians (0 = right, counter-clockwise positive)
  static set(id, angle = 0) {
    this.data[IdPool.getIndex(id)] = { angle };
  }

  // Points toward (tx, ty) from the entity's current position
  static lookAt(id, tx, ty) {
    const pos = Position.get(id);
    this.data[IdPool.getIndex(id)].angle = Math.atan2(ty - pos.y, tx - pos.x);
  }

  // Returns the facing direction as a unit vector { dx, dy }
  static toVector(id) {
    const angle = this.data[IdPool.getIndex(id)].angle;
    return { dx: Math.cos(angle), dy: Math.sin(angle) };
  }

  static fromDef(id, def) {
    this.set(id, def.angle ?? 0);
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

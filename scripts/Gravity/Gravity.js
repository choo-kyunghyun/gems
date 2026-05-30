globalThis.Gravity = class Gravity {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  // scale: gravity multiplier relative to GravitySystem.strength
  static set(id, scale = 1) {
    this.data[IdPool.getIndex(id)] = { scale };
  }

  static fromDef(id, def) {
    this.set(id, def.scale ?? 1);
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

globalThis.GravitySystem = class GravitySystem {
  static strength = 0.5;
  // Unit direction vector; default is downward (+y)
  static direction = { x: 0, y: 1, z: 0 };

  static update() {
    const { strength, direction } = GravitySystem;
    for (let i = 0; i < Gravity.data.length; i++) {
      const gravity = Gravity.data[i];
      if (gravity === undefined) continue;
      const vel = Velocity.data[i];
      if (vel === undefined) continue;
      const force = strength * gravity.scale;
      vel.vx += direction.x * force;
      vel.vy += direction.y * force;
      vel.vz += direction.z * force;
    }
  }
};

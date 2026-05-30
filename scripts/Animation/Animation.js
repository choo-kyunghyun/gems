globalThis.Animation = class Animation {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, speed) {
    this.data[IdPool.getIndex(id)] = { speed, time: 0 };
  }

  static fromDef(id, def) {
    this.set(id, def.speed ?? 1);
  }

  static update() {
    for (let i = 0; i < this.data.length; i++) {
      const anim = this.data[i];
      if (anim === undefined) continue;
      const visual = Visual.data[i];
      if (visual === undefined) continue;
      anim.time += anim.speed * Time.delta;
      visual.subimg = Math.floor(anim.time) % sprite_get_number(visual.sprite);
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

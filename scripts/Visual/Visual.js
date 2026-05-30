globalThis.Visual = class Visual {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, sprite, subimg = 0, xscale = 1, yscale = 1, rot = 0, color = c_white, alpha = 1) {
    this.data[IdPool.getIndex(id)] = { sprite, subimg, xscale, yscale, rot, color, alpha };
  }

  static fromDef(id, def) {
    this.set(
      id,
      globalThis[def.sprite],
      def.subimg ?? 0,
      def.xscale ?? 1,
      def.yscale ?? 1,
      def.rot ?? 0,
      def.color ?? c_white,
      def.alpha ?? 1,
    );
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

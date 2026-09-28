// Item component: a charge lobbed from the bag, one unit spent per throw.
globalThis.Throwable = class Throwable {
  /**
   * d fields: speed (px/s in flight), fuse (seconds to detonation), radius (blast, world px),
   * damage (at the blast centre), penetration (armor penetration at each hit).
   */
  constructor(d = {}) {
    this.speed = d.speed ?? 1280;
    this.fuse = d.fuse ?? 1.5;
    this.radius = d.radius ?? 384;
    this.damage = d.damage ?? 6;
    this.penetration = d.penetration ?? 0;
  }
};

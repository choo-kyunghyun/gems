globalThis.Collision = class Collision {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  // solid: push apart when overlapping another solid entity
  // mask: Set of tags to collide with — null means collide with all
  static set(id, solid = false, mask = null) {
    this.data[IdPool.getIndex(id)] = { solid, mask, hits: [] };
  }

  static fromDef(id, def) {
    this.set(id, def.solid ?? false, def.mask ? new Set(def.mask) : null);
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

globalThis.CollisionSystem = class CollisionSystem {
  static update() {
    const active = CollisionSystem._collect();
    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        CollisionSystem._check(active[a], active[b]);
      }
    }
  }

  static _collect() {
    const active = [];
    for (let i = 0; i < Collision.data.length; i++) {
      const col = Collision.data[i];
      if (col === undefined) continue;
      const pos = Position.data[i];
      if (pos === undefined) continue;
      const bbox = BBox.data[i];
      if (bbox === undefined) continue;
      col.hits.length = 0;
      active.push({ i, col, pos, bbox });
    }
    return active;
  }

  static _check(ea, eb) {
    if (!CollisionSystem._accepts(ea.col.mask, Tag.data[eb.i])) return;
    if (!CollisionSystem._accepts(eb.col.mask, Tag.data[ea.i])) return;

    const ax1 = ea.pos.x + ea.bbox.x, ay1 = ea.pos.y + ea.bbox.y;
    const ax2 = ax1 + ea.bbox.w,       ay2 = ay1 + ea.bbox.h;
    const bx1 = eb.pos.x + eb.bbox.x, by1 = eb.pos.y + eb.bbox.y;
    const bx2 = bx1 + eb.bbox.w,       by2 = by1 + eb.bbox.h;

    if (ax2 <= bx1 || bx2 <= ax1 || ay2 <= by1 || by2 <= ay1) return;

    const idA = IdPool.makeId(ea.i, IdPool.generations[ea.i]);
    const idB = IdPool.makeId(eb.i, IdPool.generations[eb.i]);
    ea.col.hits.push(idB);
    eb.col.hits.push(idA);

    if (ea.col.solid && eb.col.solid) {
      CollisionSystem._resolve(ea, eb, ax1, ay1, ax2, ay2, bx1, by1, bx2, by2);
    }
  }

  // Returns true if mask accepts the given tag set
  static _accepts(mask, tags) {
    if (mask === null) return true;
    if (tags === undefined) return false;
    for (const t of mask) {
      if (tags.has(t)) return true;
    }
    return false;
  }

  // Minimum translation vector — splits overlap evenly between both entities
  static _resolve(ea, eb, ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    const overlapX = Math.min(ax2, bx2) - Math.max(ax1, bx1);
    const overlapY = Math.min(ay2, by2) - Math.max(ay1, by1);
    const push = (overlapX < overlapY ? overlapX : overlapY) * 0.5;

    if (overlapX < overlapY) {
      const dir = ea.pos.x < eb.pos.x ? -1 : 1;
      ea.pos.x += dir * push;
      eb.pos.x -= dir * push;
    } else {
      const dir = ea.pos.y < eb.pos.y ? -1 : 1;
      ea.pos.y += dir * push;
      eb.pos.y -= dir * push;
    }
  }
};

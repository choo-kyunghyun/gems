globalThis.CollisionSystem = {
  update(world) {
    const active = this._collect(world);
    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        this._check(active[a], active[b], world);
      }
    }
  },

  _collect(world) {
    const ids = world.query(Collision, Position, BBox);
    const active = [];
    for (const id of ids) {
      const col = world.get(Collision, id);
      col.hits.length = 0;
      active.push({
        id,
        col,
        pos: world.get(Position, id),
        bbox: world.get(BBox, id),
      });
    }
    return active;
  },

  _check(ea, eb, world) {
    if (!this._accepts(ea.col.mask, world.get(Tag, ea.id))) return;
    if (!this._accepts(eb.col.mask, world.get(Tag, eb.id))) return;

    const ax1 = ea.pos.x + ea.bbox.x,
      ay1 = ea.pos.y + ea.bbox.y;
    const ax2 = ax1 + ea.bbox.width,
      ay2 = ay1 + ea.bbox.height;
    const bx1 = eb.pos.x + eb.bbox.x,
      by1 = eb.pos.y + eb.bbox.y;
    const bx2 = bx1 + eb.bbox.width,
      by2 = by1 + eb.bbox.height;

    if (ax2 <= bx1 || bx2 <= ax1 || ay2 <= by1 || by2 <= ay1) return;

    ea.col.hits.push(eb.id);
    eb.col.hits.push(ea.id);

    if (ea.col.solid && eb.col.solid) {
      this._resolve(ea, eb, ax1, ay1, ax2, ay2, bx1, by1, bx2, by2);
    }
  },

  _accepts(mask, tags) {
    if (mask === null) return true;
    if (tags === undefined) return false;
    for (const t of mask) {
      if (tags.has(t)) return true;
    }
    return false;
  },

  _resolve(ea, eb, ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    const overlapX = Math.min(ax2, bx2) - Math.max(ax1, bx1);
    const overlapY = Math.min(ay2, by2) - Math.max(ay1, by1);
    const aKin = ea.col.kinematic;
    const bKin = eb.col.kinematic;
    if (aKin && bKin) return;
    const full = overlapX < overlapY ? overlapX : overlapY;

    if (overlapX < overlapY) {
      const dir = ea.pos.x < eb.pos.x ? -1 : 1;
      if (!aKin) ea.pos.x += dir * (bKin ? full : full * 0.5);
      if (!bKin) eb.pos.x -= dir * (aKin ? full : full * 0.5);
    } else {
      const dir = ea.pos.y < eb.pos.y ? -1 : 1;
      if (!aKin) ea.pos.y += dir * (bKin ? full : full * 0.5);
      if (!bKin) eb.pos.y -= dir * (aKin ? full : full * 0.5);
    }
  },
};

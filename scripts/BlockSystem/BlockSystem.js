// Hit-from-below interactables for the platformer.
//
//   const coins = BlockSystem.resolveHit(world, playerId, prevVelY);
//
// Call AFTER SolidSystem has resolved physics, passing the player's vel.y from
// BEFORE physics ran this tick. A negative prevVelY means the player was rising;
// if they also ended up with their top edge touching a QBlock/Brick bottom, it
// counts as a hit from below.
//
// QBlock: marks used and awards 1 coin (returns 1) on the first hit; inert after.
// Brick:  removes the entity (returns 0 coins).
//
// The ±2 px tolerance on edge comparison absorbs floating-point residuals left by
// SolidSystem sub-stepping; it is tight enough to avoid false positives when the
// player stands on top of a block (player top is then ~24px above block bottom).
globalThis.BlockSystem = {
  resolveHit(world, playerId, prevVelY) {
    if (prevVelY >= 0) return 0; // player wasn't moving upward this tick

    const ppos = world.get(Position, playerId);
    const pbox = world.get(BBox, playerId);
    const ptop = ppos.y + pbox.y; // player top edge
    const px1 = ppos.x + pbox.x;
    const px2 = px1 + pbox.width;

    let coins = 0;

    for (const id of world.query(QBlock, Position, BBox)) {
      const bpos = world.get(Position, id);
      const bbox = world.get(BBox, id);
      const bbot = bpos.y + bbox.y + bbox.height; // block bottom edge
      const bx1 = bpos.x + bbox.x;
      const bx2 = bx1 + bbox.width;

      if (ptop < bbot - 2 || ptop > bbot + 2) continue; // not touching block bottom
      if (px2 <= bx1 || px1 >= bx2) continue; // no horizontal overlap

      const qb = world.get(QBlock, id);
      if (qb.used) continue;
      qb.used = true;
      coins++;
    }

    for (const id of world.query(Brick, Position, BBox)) {
      const bpos = world.get(Position, id);
      const bbox = world.get(BBox, id);
      const bbot = bpos.y + bbox.y + bbox.height;
      const bx1 = bpos.x + bbox.x;
      const bx2 = bx1 + bbox.width;

      if (ptop < bbot - 2 || ptop > bbot + 2) continue;
      if (px2 <= bx1 || px1 >= bx2) continue;

      world.remove(id);
    }

    return coins;
  },
};

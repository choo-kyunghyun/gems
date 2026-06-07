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

    const p = AABB.of(world, playerId); // p.y1 = player top edge

    let coins = 0;

    for (const id of world.query(QBlock, Position, BBox)) {
      const b = AABB.of(world, id); // b.y2 = block bottom edge

      if (p.y1 < b.y2 - 2 || p.y1 > b.y2 + 2) continue; // not touching block bottom
      if (p.x2 <= b.x1 || p.x1 >= b.x2) continue; // no horizontal overlap

      const qb = world.get(QBlock, id);
      if (qb.used) continue;
      qb.used = true;
      coins++;
    }

    for (const id of world.query(Brick, Position, BBox)) {
      const b = AABB.of(world, id);

      if (p.y1 < b.y2 - 2 || p.y1 > b.y2 + 2) continue;
      if (p.x2 <= b.x1 || p.x1 >= b.x2) continue;

      world.remove(id);
    }

    return coins;
  },
};

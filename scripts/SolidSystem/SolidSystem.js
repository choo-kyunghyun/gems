/**
 * Moves the dynamic solid bodies and keeps them out of the kinematic solids and the blocking
 * cells, in sub-steps of at most `maxStep`. A body slides along a face by its own tangential
 * velocity, and its Velocity is rewritten as the displacement it actually made, so a body pressed
 * into a wall reads as still. Every displacement goes through the runtime, so no body is ever
 * inside a solid.
 */
globalThis.SolidSystem = {
  KEY: "solid_tiles", // derived, on the level's own entity
  maxStep: 8, // px; below the thinnest collider to prevent tunneling

  /** The level's SolidTiles, seeded from its grid on the first read and synced by each pass. */
  tiles(level) {
    return level.entities.derive(level.self, SolidSystem.KEY, () => new SolidTiles(level.grid));
  },

  update(level) {
    const dt = Time.step;
    const maxStep = SolidSystem.maxStep;
    const tiles = SolidSystem.tiles(level);
    tiles.sync();
    const against = tiles.against;
    // Velocity leads the query: the movers, not the walls
    level.entities.forEach([Velocity, Collision, Instance, Position], (id, vel, col, h, pos) => {
      if (!col.solid) return;
      if (!h.shaped) return; // no mirror yet
      if (h.still) return; // a kinematic never moves
      const dx = vel.x * dt;
      const dy = vel.y * dt;
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      if (m === 0) return;
      const iters = Math.max(1, Math.ceil(m / maxStep));
      const x0 = pos.x;
      const y0 = pos.y;
      PuppetSystem.move(h, pos, dx, dy, iters, against);
      vel.x = (pos.x - x0) / dt;
      vel.y = (pos.y - y0) / dt;
    });
  },
};

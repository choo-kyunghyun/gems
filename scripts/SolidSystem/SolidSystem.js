/**
 * Moves the dynamic solid bodies and keeps them out of the kinematic solids: every solid body
 * with a Velocity moves through its mirror (PuppetSystem.move — the runtime against the
 * kinematic mirrors, one axis at a time) in sub-steps of at most `maxStep`. A body slides along
 * a face by its own tangential velocity (x blocked, y free), and its Velocity is rewritten as the
 * displacement it actually made, so a reader of speed (Doll.pace) sees a body pressed into a
 * wall stand still. Every displacement a body takes goes through the runtime (SeparationSystem's
 * push too), so no body is ever inside a solid. The bake NavGrid stamps and the bare static
 * collider are Colliders'.
 */
globalThis.SolidSystem = {
  maxStep: 8, // the runtime's sub-step (px): keep below the thinnest collider to prevent tunneling

  update(level) {
    const dt = Time.step;
    const maxStep = SolidSystem.maxStep;
    // Velocity leads: the movers, not the walls
    level.entities.forEach([Velocity, Collision, Instance, Position], (id, vel, col, h, pos) => {
      if (!col.solid) return;
      if (!h.shaped) return; // no mirror yet — PuppetSystem's next update shapes it
      if (h.still) return; // a kinematic never moves (Colliders' premise)
      const dx = vel.x * dt;
      const dy = vel.y * dt;
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      if (m === 0) return;
      const iters = Math.max(1, Math.ceil(m / maxStep));
      const x0 = pos.x;
      const y0 = pos.y;
      PuppetSystem.move(h, pos, dx, dy, iters);
      vel.x = (pos.x - x0) / dt;
      vel.y = (pos.y - y0) / dt;
    });
  },
};

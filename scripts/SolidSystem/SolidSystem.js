/**
 * Moves the dynamic solid bodies and keeps them out of the kinematic solids: every solid body
 * with a Velocity moves through its mirror (PuppetSystem) — `move_and_collide` against `Solid`,
 * the kinematic mirrors, one axis at a time in sub-steps of at most `maxStep`, the other axis's
 * move capped to 0 so the runtime's perpendicular try never creeps a body along a face it is
 * pressed into — and reads its Position back off the instance. A body slides along a face by
 * its own tangential velocity (x blocked, y free), and its Velocity is rewritten as the
 * displacement it actually made, so a reader of speed (Doll.pace) sees a body pressed into a
 * wall stand still. Every displacement a body takes goes through the runtime (SeparationSystem's
 * push too), so no body is ever inside a solid. Bodies it moves must NOT also be in
 * MovementSystem. The bake NavGrid stamps and the bare static collider are Colliders'.
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
      const inst = h.inst;
      // the return is a GML array: read through array_length or not at all (docs/GMRT.md)
      if (dx !== 0) inst.move_and_collide(dx, 0, Solid, iters, 0, 0, -1, 0);
      if (dy !== 0) inst.move_and_collide(0, dy, Solid, iters, 0, 0, 0, -1);
      pos.x = inst.x - h.ox;
      pos.y = inst.y - h.oy;
      vel.x = (pos.x - x0) / dt;
      vel.y = (pos.y - y0) / dt;
    });
  },
};

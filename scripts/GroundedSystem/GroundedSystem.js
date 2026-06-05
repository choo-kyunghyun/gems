globalThis.GroundedSystem = {
  update(world) {
    const statics = world.query(Collision, Position, BBox);
    const movers  = world.query(Grounded,  Position, BBox, Velocity);

    for (let m = 0; m < movers.length; m++) {
      const id  = movers[m];
      const gr  = world.get(Grounded,  id);
      const vel = world.get(Velocity,  id);
      const pos = world.get(Position,  id);
      const box = world.get(BBox,      id);

      const mL = pos.x + box.x;
      const mR = mL + box.width;
      const mT = pos.y + box.y;
      const mB = mT + box.height;

      gr.isGrounded = false;

      for (let s = 0; s < statics.length; s++) {
        const sid = statics[s];
        if (sid === id) continue;
        if (!world.get(Collision, sid).kinematic) continue;

        const sPos = world.get(Position, sid);
        const sBox = world.get(BBox,     sid);
        const sL = sPos.x + sBox.x;
        const sR = sL + sBox.width;
        const sT = sPos.y + sBox.y;
        const sB = sT + sBox.height;

        if (mR <= sL || mL >= sR) continue;

        const snapY = Math.abs(vel.y) * world.tickDuration + 1;

        // Ceiling
        if (vel.y < 0 && mT <= sB && mT >= sB - snapY) {
          pos.y = sB - box.y;
          vel.y = 0;
          break;
        }

        // Floor
        if (vel.y >= 0 && mB >= sT && mB <= sT + snapY) {
          pos.y = sT - box.y - box.height;
          vel.y = 0;
          gr.isGrounded = true;
          break;
        }
      }
    }
  },
};

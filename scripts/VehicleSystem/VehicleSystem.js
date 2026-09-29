/**
 * Turns each vehicle's steer into its Velocity, ahead of the solid pass that moves it, and takes
 * the steer, so a frame nobody steers brakes.
 */
globalThis.VehicleSystem = {
  update(level) {
    const step = Time.step;
    level.entities.forEach([Vehicle, Velocity], (id, v, vel) => {
      const tx = v.steerX * v.speed;
      const ty = v.steerY * v.speed;
      v.steerX = 0;
      v.steerY = 0;
      const dx = tx - vel.x;
      const dy = ty - vel.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const reach = v.accel * step;
      if (d <= reach) {
        vel.x = tx;
        vel.y = ty;
        return;
      }
      vel.x += (dx / d) * reach;
      vel.y += (dy / d) * reach;
    });
  },
};

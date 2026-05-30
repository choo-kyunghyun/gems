globalThis.Simulation = class Simulation {
  // tickRate: number of ticks per second
  constructor(tickRate = 60) {
    this.tickDuration = 1_000_000 / tickRate; // microseconds
    this.accumulator = 0;
    this.alpha = 0; // [0, 1) interpolation factor for rendering
  }

  // systems: array of { update() } — called in order each tick
  update(systems) {
    this.accumulator += delta_time;

    // Cap accumulator to prevent spiral of death (max 5 ticks catchup)
    this.accumulator = Math.min(this.accumulator, this.tickDuration * 5);

    while (this.accumulator >= this.tickDuration) {
      for (const system of systems) {
        system.update();
      }
      this.accumulator -= this.tickDuration;
    }

    this.alpha = this.accumulator / this.tickDuration;
  }
};

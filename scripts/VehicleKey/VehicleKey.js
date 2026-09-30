// Item component: a key whose instance names the one vehicle it summons and stows.
globalThis.VehicleKey = class VehicleKey {
  /** d: preset, the entity preset of the vehicle it summons. */
  constructor(d) {
    this.preset = d.preset;
  }
};

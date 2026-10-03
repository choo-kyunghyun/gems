// Colony need defs: the needs a body carries, in HUD order. Registered at boot, not top-level, as
// top-level code runs in script load order (docs/GMRT.md). A bar's tint is its debuff status's
// color, so a need adds nothing here that the status already states.
globalThis.contentNeeds = {
  register() {
    Need.register([
      // rising meters, the named debuff applying at `critical`; rate per second, tuned to deplete
      // over minutes
      {
        id: Thirst,
        name: "SURVIVAL_THIRST",
        seed: { value: 0, max: 100, rate: 0.8, critical: 0.8, status: "dehydrated" },
      },
      {
        id: Hunger,
        name: "SURVIVAL_HUNGER",
        seed: { value: 0, max: 100, rate: 0.5, critical: 0.8, status: "starving" },
      },
      {
        id: Drowsiness,
        name: "SURVIVAL_DROWSINESS",
        seed: { value: 0, max: 100, rate: 0.4, critical: 0.85, status: "drowsy" },
      },
    ]);
  },
};

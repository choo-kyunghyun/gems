// RPG status defs. Registered once at level create() (NOT top-level — GMRT load-order). The kit
// system is genre-agnostic; these are the content. Colors drive HUD chip tints.
// A DoT poison is symmetric to regen — one def + an applier away if needed.
globalThis.RpgStatuses = {
  register() {
    Status.register([
      {
        id: "encumbered",
        name: "STATUS_ENCUMBERED",
        color: "#c79a5b",
        beneficial: false,
        mult: { speed: 0.5 }, // fallback — EncumbranceSystem overrides per-instance live
      },
      {
        id: "regen",
        name: "STATUS_REGEN",
        color: "#5fd08a",
        beneficial: true,
        duration: 8,
        hot: 1,
        interval: 1,
      },
      {
        id: "fortify",
        name: "STATUS_FORTIFY",
        color: "#e0b84f",
        beneficial: true,
        duration: 12,
        mods: { attack: 3, defense: 2 },
      },
      // survival debuffs — applied/cleared by need systems at critical threshold
      {
        id: "dehydrated",
        name: "STATUS_DEHYDRATED",
        color: "#4aa3d6",
        beneficial: false,
        dot: 1,
        interval: 2,
      },
      {
        id: "starving",
        name: "STATUS_STARVING",
        color: "#c98a3a",
        beneficial: false,
        dot: 1,
        interval: 2,
      },
      {
        id: "drowsy",
        name: "STATUS_DROWSY",
        color: "#8a7ec0",
        beneficial: false,
        mult: { speed: 0.6 },
      },
    ]);
  },
};

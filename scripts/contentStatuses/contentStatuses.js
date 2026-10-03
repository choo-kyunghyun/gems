/** Colony status defs. */
globalThis.contentStatuses = {
  register() {
    Status.register([
      {
        id: "encumbered",
        name: "STATUS_ENCUMBERED",
        color: "#c79a5b",
        beneficial: false,
        mult: { speed: 0.5 }, // a fallback: the live factor is set per instance
      },
      {
        id: "regen",
        name: "STATUS_REGEN",
        color: "#5fd08a",
        beneficial: true,
        duration: 8,
        hp: 1,
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
      // the survival needs' critical debuffs
      {
        id: "dehydrated",
        name: "STATUS_DEHYDRATED",
        color: "#4aa3d6",
        beneficial: false,
        mult: { speed: 0.8 },
      },
      {
        id: "starving",
        name: "STATUS_STARVING",
        color: "#c98a3a",
        beneficial: false,
        mult: { speed: 0.8 },
      },
      {
        id: "drowsy",
        name: "STATUS_DROWSY",
        color: "#8a7ec0",
        beneficial: false,
        mult: { speed: 0.6 },
      },
      // the cold's debuff
      {
        id: "hypothermic",
        name: "STATUS_HYPOTHERMIC",
        color: "#9fc4e8",
        beneficial: false,
        mult: { speed: 0.7 },
      },
    ]);
  },
};

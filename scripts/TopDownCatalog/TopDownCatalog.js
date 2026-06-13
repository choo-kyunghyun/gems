// Placeable-entity catalog for the level editor — the "database" of what can be placed,
// mirroring the spawn presets TopDownLevel.spawn understands (slime/npc/chest/prop/reach).
//
// Each entry carries editor display (label + marker color) and a `make(gx, gy)` factory
// that returns a FRESH spawn record with sensible default fields (fresh per call, so two
// placed entities never share a nested array/object reference). The editor reads `entries`
// for the palette and `get(id)` for marker color/label; export writes the spawn records
// straight into the level file's `spawns`.
//
// Display labels are plain strings (a dev-tool palette); colors are "#rrggbb" parsed via
// Color.parse for the world-space markers.
globalThis.TopDownCatalog = {
  entries: [
    {
      id: "slime",
      label: "Slime",
      color: "#78dc82",
      make: (gx, gy) => ({ preset: "slime", gx, gy, loot: [] }),
    },
    {
      id: "npc",
      label: "NPC",
      color: "#ffffff",
      make: (gx, gy) => ({
        preset: "npc",
        gx,
        gy,
        label: "NPC",
        nameKey: "NPC_ELDER_NAME",
        questId: "td_slimes",
      }),
    },
    {
      id: "chest",
      label: "Chest",
      color: "#c8a046",
      make: (gx, gy) => ({ preset: "chest", gx, gy, capacity: 12, items: [] }),
    },
    {
      id: "prop",
      label: "Prop",
      color: "#785a3c",
      make: (gx, gy) => ({
        preset: "prop",
        gx,
        gy,
        label: "Prop",
        color: "#785a3c",
      }),
    },
    {
      id: "reach",
      label: "Reach",
      color: "#5aa0ff",
      make: (gx, gy) => ({ preset: "reach", gx, gy, half: 44 }),
    },
  ],

  // Catalog entry for a spawn's preset id, or undefined (e.g. an unknown legacy preset).
  get(id) {
    for (let i = 0; i < this.entries.length; i++)
      if (this.entries[i].id === id) return this.entries[i];
    return undefined;
  },
};

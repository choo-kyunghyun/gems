// Placeable-entity catalog for the level editor — the "database" of what can be placed,
// mirroring the spawn presets TopDownLevel.spawn understands (slime/npc/chest/prop/reach).
//
// Each entry carries editor display (label + marker color), a `make(gx, gy)` factory that
// returns a FRESH spawn record with sensible default fields (fresh per call, so two placed
// entities never share a nested array/object reference), and a `fields` schema describing
// the per-preset editable properties for the editor's property panel. The editor reads
// `entries` for the palette, `get(id)` for marker color/label, and `fields` to render the
// property editor; export writes the (edited) spawn records straight into the level file's
// `spawns`.
//
// Field schema (data only — the editor maps each kind to a widget):
//   { key, kind: "int",   label, min?, max?, step? }      → numeric stepper
//   { key, kind: "select", label, options: [{name,value}] } → value picker (static list)
//   { key, kind: "quest", label }                          → picker over QuestLog ids
//   { key, kind: "items", label }                          → add/remove list of {itemId,qty}
//
// Display labels are plain strings (a dev-tool palette); colors are "#rrggbb" parsed via
// Color.parse for the world-space markers.
const TD_STATION_KINDS = [
  { name: "(none)", value: undefined },
  { name: "storage", value: "storage" },
  { name: "workbench", value: "workbench" },
  { name: "claim", value: "claim" },
];

globalThis.TopDownCatalog = {
  entries: [
    {
      id: "slime",
      label: "Slime",
      color: "#78dc82",
      make: (gx, gy) => ({ preset: "slime", gx, gy, hp: 3, loot: [] }),
      fields: [
        { key: "hp", kind: "int", label: "HP", min: 1, max: 99 },
        { key: "loot", kind: "items", label: "Loot" },
      ],
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
      fields: [{ key: "questId", kind: "quest", label: "Quest" }],
    },
    {
      id: "chest",
      label: "Chest",
      color: "#c8a046",
      make: (gx, gy) => ({ preset: "chest", gx, gy, capacity: 12, items: [] }),
      fields: [
        { key: "capacity", kind: "int", label: "Capacity", min: 1, max: 99 },
        { key: "items", kind: "items", label: "Items" },
      ],
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
      fields: [
        {
          key: "kind",
          kind: "select",
          label: "Station",
          options: TD_STATION_KINDS,
        },
      ],
    },
    {
      id: "reach",
      label: "Reach",
      color: "#5aa0ff",
      make: (gx, gy) => ({ preset: "reach", gx, gy, half: 44 }),
      fields: [
        {
          key: "half",
          kind: "int",
          label: "Radius",
          min: 8,
          max: 256,
          step: 4,
        },
      ],
    },
  ],

  // Catalog entry for a spawn's preset id, or undefined (e.g. an unknown legacy preset).
  get(id) {
    for (let i = 0; i < this.entries.length; i++)
      if (this.entries[i].id === id) return this.entries[i];
    return undefined;
  },
};

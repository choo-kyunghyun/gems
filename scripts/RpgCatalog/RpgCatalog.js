// Placeable-entity catalog for the level editor, mirroring RpgSpawn.spawn's presets.
// Entry shape + the field schema are on the RpgCatalog declaration below.

// Interaction kinds authorable on a prop in the editor (each = an InteractAction id). bed/arcade are
// build-mode-only so they're omitted here; add a kind = one entry (matches the InteractAction registry).
const TD_INTERACTION_KINDS = [
  { name: "(none)", value: undefined },
  { name: "storage", value: "storage" },
  { name: "workbench", value: "workbench" },
  { name: "claim", value: "claim" },
  { name: "hydrate", value: "hydrate" },
  { name: "feed", value: "feed" },
  { name: "buff", value: "buff" },
];

/**
 * Each entry has editor display (label + marker color), a `make(gx, gy)` factory returning a FRESH
 * spawn record (fresh per call, so placed entities never share a nested array/object reference), and
 * a `fields` schema for the property panel. Export writes the records into the level file's `spawns`.
 *
 * Field schema (data only — the editor maps each kind to a widget):
 *   { key, kind: "int",   label, min?, max?, step? }        → numeric stepper
 *   { key, kind: "select", label, options: [{name,value}] } → value picker (static list)
 *   { key, kind: "quest", label }                           → picker over QuestLog ids
 *   { key, kind: "items", label }                           → add/remove list of {itemId,qty}
 */
globalThis.RpgCatalog = {
  entries: [
    {
      id: "raider",
      label: "Raider",
      color: "#d06a5a",
      make: (gx, gy) => ({ preset: "raider", gx, gy, hp: 3, loot: [] }),
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
        questId: "td_humans",
      }),
      fields: [{ key: "questId", kind: "quest", label: "Quest" }],
    },
    {
      id: "chest",
      label: "Footlocker",
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
          label: "Interaction",
          options: TD_INTERACTION_KINDS,
        },
      ],
    },
    {
      id: "reach",
      label: "Reach",
      color: "#5aa0ff",
      make: (gx, gy) => ({ preset: "reach", gx, gy, half: 88 }),
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

  /** Catalog entry for a spawn's preset id, or undefined (e.g. an unknown legacy preset). */
  get(id) {
    for (let i = 0; i < this.entries.length; i++)
      if (this.entries[i].id === id) return this.entries[i];
    return undefined;
  },
};

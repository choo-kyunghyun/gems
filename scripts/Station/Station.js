/**
 * Marks an entity as an interactable station. `kind` selects what opening it does
 * (see Interactable): "storage" opens the StorageUI transfer window for the entity's
 * Inventory; "workbench" opens the CraftingUI for recipes filtered by this kind.
 * Purely-decorative furniture has NO Station (it's just a solid prop).
 *
 * @typedef {Object} Station
 * @property {string} kind  "storage" | "workbench"
 */
globalThis.Station = "Station";

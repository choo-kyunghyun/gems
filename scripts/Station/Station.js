/**
 * Marks an entity as an interactable station. `kind` selects what opening it does
 * (see Interactable): "storage" opens the StorageUI transfer window for the entity's
 * Inventory; "workbench" opens the CraftingUI for recipes filtered by this kind; "claim"
 * (a Survey Post) claims the buildable zone via BuildMode.claim, then detaches its own
 * Station so it can't be re-claimed. Purely-decorative furniture has NO Station.
 *
 * @typedef {Object} Station
 * @property {string} kind  "storage" | "workbench" | "claim"
 */
globalThis.Station = "Station";

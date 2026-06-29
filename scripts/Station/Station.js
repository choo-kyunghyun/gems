/**
 * Interactable station; `kind` selects what opening it does (see Interactable): "storage" →
 * StorageUI transfer; "workbench" → CraftingUI (upgradeable via the `module` slot); "claim"
 * (Survey Post) → claims the buildable zone then self-detaches; "arcade" → push a minigame;
 * "bed" → sleep. Decorative furniture has NO Station.
 * @typedef {Object} Station
 * @property {string} kind     "storage" | "workbench" | "claim" | "arcade" | "bed"
 * @property {string} [module] workbench only: slotted WorkbenchModule itemId ("" / absent = empty)
 */
globalThis.Station = "Station";

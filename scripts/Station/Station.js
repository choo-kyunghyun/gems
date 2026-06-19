/**
 * Marks an entity as an interactable station. `kind` selects what opening it does
 * (see Interactable): "storage" opens the StorageUI transfer window for the entity's
 * Inventory; "workbench" opens the CraftingUI — an upgradeable bench with a single MODULE
 * slot (`module`): slot a WorkbenchModule item to unlock its recipes (or, for the Toolkit
 * module, switch the bench into weapon-mod mode); "claim" (a Survey Post) claims the buildable
 * zone via BuildMode.claim, then detaches its own Station so it can't be re-claimed; "arcade"
 * pushes a minigame scene; "bed" starts sleeping (fast-forwards time). Purely-decorative
 * furniture has NO Station.
 *
 * @typedef {Object} Station
 * @property {string} kind     "storage" | "workbench" | "claim" | "arcade" | "bed"
 * @property {string} [module] workbench only: the slotted WorkbenchModule itemId ("" / absent = empty)
 */
globalThis.Station = "Station";

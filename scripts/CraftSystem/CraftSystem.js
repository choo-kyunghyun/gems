// Pure crafting operations over an entity's Inventory (no world tick). Recipes pull
// their inputs from, and place their output into, the SAME inventory (the crafter's
// bag). Modeled on InventorySystem — methods take the components/world directly.
globalThis.CraftSystem = {
  // True when `inv` holds every input of `recipe` in the required quantity.
  canCraft(inv, recipe) {
    if (inv === undefined || recipe === undefined) return false;
    for (let i = 0; i < recipe.inputs.length; i++) {
      const need = recipe.inputs[i];
      if (!InventorySystem.has(inv, need.itemId, need.qty)) return false;
    }
    return true;
  },

  // Craft `recipeId` for entity `crafterId`, sourcing inputs from and depositing the
  // output into its Inventory. Verifies the output will fit BEFORE consuming anything
  // (InventorySystem.add returns leftover) so a full bag can't eat the materials.
  // Returns true on success.
  craft(world, crafterId, recipeId) {
    const recipe = Recipe.get(recipeId);
    const inv = world.get(Inventory, crafterId);
    if (recipe === undefined || inv === undefined) return false;
    if (!this.canCraft(inv, recipe)) return false;

    // Dry-run the output against a clone so we don't mutate on a no-fit.
    const probe = {
      slots: this._cloneSlots(inv.slots),
      capacity: inv.capacity,
    };
    if (inv.maxWeight !== undefined) probe.maxWeight = inv.maxWeight;
    const out = recipe.output;
    if (InventorySystem.add(probe, out.itemId, out.qty) !== 0) {
      Log.info(`craft ${recipeId} failed — no room for output`);
      return false;
    }

    for (let i = 0; i < recipe.inputs.length; i++) {
      InventorySystem.remove(
        inv,
        recipe.inputs[i].itemId,
        recipe.inputs[i].qty,
      );
    }
    InventorySystem.add(inv, out.itemId, out.qty);
    Log.info(`crafted ${out.qty}x ${out.itemId}`);
    return true;
  },

  _cloneSlots(slots) {
    const out = [];
    for (let i = 0; i < slots.length; i++) {
      out.push({ itemId: slots[i].itemId, qty: slots[i].qty });
    }
    return out;
  },
};

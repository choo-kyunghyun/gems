// Pure crafting: inputs consumed from and output placed into the crafter's own Inventory. No
// world tick.
globalThis.Crafting = {
  /**
   * The station gate is enforced here, so it holds even for a recipe shown out of context.
   */
  canCraft(inv, recipe, module) {
    if (inv === undefined || recipe === undefined) return false;
    if (recipe.requires !== undefined && recipe.requires !== module)
      return false;
    for (let i = 0; i < recipe.inputs.length; i++) {
      const need = recipe.inputs[i];
      if (!Bag.has(inv, need.itemId, need.qty)) return false;
    }
    return true;
  },

  /**
   * The output fit is dry-run before inputs are consumed, so a full bag can't eat materials.
   */
  craft(entities, crafterId, recipeId, module) {
    const recipe = Recipe.get(recipeId);
    if (recipe === undefined) return false;
    const inv = entities.require(crafterId, Inventory);
    if (!Crafting.canCraft(inv, recipe, module)) return false;

    const probe = {
      slots: Crafting._cloneSlots(inv.slots),
      capacity: inv.capacity,
    };
    if (inv.maxWeight !== undefined) probe.maxWeight = inv.maxWeight;
    const out = recipe.output;
    if (Bag.add(probe, out.itemId, out.qty) !== 0) {
      Log.info(`craft ${recipeId} failed — no room for output`);
      return false;
    }

    for (let i = 0; i < recipe.inputs.length; i++) {
      Bag.remove(
        inv,
        recipe.inputs[i].itemId,
        recipe.inputs[i].qty,
      );
    }
    Bag.add(inv, out.itemId, out.qty);
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

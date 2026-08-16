// Pure crafting: inputs consumed from and output placed into the crafter's own Inventory. No world tick.
globalThis.CraftSystem = {
  /**
   * module gate + input check. gate enforced here so it holds even if UI surfaces a recipe out of context.
   */
  canCraft(inv, recipe, module) {
    if (inv === undefined || recipe === undefined) return false;
    if (recipe.requires !== undefined && recipe.requires !== module)
      return false;
    for (let i = 0; i < recipe.inputs.length; i++) {
      const need = recipe.inputs[i];
      if (!InventorySystem.has(inv, need.itemId, need.qty)) return false;
    }
    return true;
  },

  /**
   * dry-run output fit before consuming inputs — a full bag can't eat materials.
   */
  craft(entities, crafterId, recipeId, module) {
    const recipe = Recipe.get(recipeId);
    const inv = entities.get(Inventory, crafterId);
    if (recipe === undefined || inv === undefined) return false;
    if (!this.canCraft(inv, recipe, module)) return false;

    // probe a clone so we don't mutate on a no-fit.
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

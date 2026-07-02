// Rebuilds an entity's Appearance layer stack from its Equipment — derived-from-source like
// StatModel.recompute (a full rebuild can't drift), run at the same chokepoints (equip/unequip,
// plus after a carried sheet lands via EntitySnapshot.apply). No-op for entities without an
// Appearance (opt-in: paper-doll humanoids only). An Equippable shows on the doll only when its
// `worn` names an existing sprite that mirrors the body's strip layout (see Appearance).
globalThis.AppearanceSystem = {
  // slot -> draw-order policy: back layers render behind the body, front layers over it in order
  BACK_SLOTS: ["backpack"],
  FRONT_SLOTS: ["armor", "trinket", "weapon"],

  rebuild(world, id) {
    const ap = world.get(Appearance, id);
    if (ap === undefined) return;
    // an Appearance WITHOUT Equipment is AUTHORED (e.g. the bandit outfit on a raider) — leave
    // it alone; only equipment-carrying dolls are derived (cleared + rebuilt) here
    const eq = world.get(Equipment, id);
    const inv = world.get(Inventory, id);
    if (eq === undefined || inv === undefined) return;
    ap.back.length = 0;
    ap.front.length = 0;
    this._collect(eq, inv, this.BACK_SLOTS, ap.back);
    this._collect(eq, inv, this.FRONT_SLOTS, ap.front);
  },

  _collect(eq, inv, slotNames, out) {
    for (const slotName of slotNames) {
      const uid = eq.slots[slotName];
      if (uid === undefined || uid === "") continue;
      const s = InventorySystem.findByUid(inv, uid);
      if (s === undefined) continue;
      const item = Item.get(s.itemId);
      const eqp =
        item !== undefined ? item.getComponent(Equippable) : undefined;
      if (eqp === undefined || eqp.worn === "") continue;
      // asset_get_index returns an opaque ref (not a number) — validate via sprite_exists
      const spr = asset_get_index(eqp.worn);
      if (!sprite_exists(spr)) continue;
      out.push({ sprite: spr, color: c_white });
    }
  },
};

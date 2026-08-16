/**
 * Also runs after a carried sheet lands via EntitySnapshot.apply. No-op for entities without an
 * Appearance (opt-in: paper-doll humanoids only). An Equippable shows on the doll when its `worn` names
 * an existing sprite that mirrors the body's strip layout (see Appearance) — and the WEAPON slot needs
 * no worn sheet at all: an unset `worn` falls back to the item's own icon drawn ANCHORED at the body's
 * right-hand attachment point (SpriteMeta `anchors`), so every weapon gets a held visual with zero
 * dedicated art.
 */
globalThis.AppearanceSystem = {
  // slot -> draw-order policy: back layers render behind the body, front layers over it in order
  BACK_SLOTS: ["backpack"],
  // weapon stays LAST so bespoke posed `worn` art draws over the armor it would be held in front of
  FRONT_SLOTS: ["armor", "trinket", "weapon"],
  HELD_SCALE: 0.5, // anchored held-icon size relative to the body's draw scale

  /**
   * @param {Entity} entities
   * @param {number} id
   */
  rebuild(entities, id) {
    const ap = entities.get(Appearance, id);
    if (ap === undefined) return;
    // an Appearance WITHOUT Equipment is AUTHORED (e.g. the bandit outfit on a raider) — leave
    // it alone; only equipment-carrying dolls are derived (cleared + rebuilt) here
    const eq = entities.get(Equipment, id);
    const inv = entities.get(Inventory, id);
    if (eq === undefined || inv === undefined) return;
    ap.back.length = 0;
    ap.front.length = 0;
    this._collect(eq, inv, this.BACK_SLOTS, ap.back);
    this._collect(eq, inv, this.FRONT_SLOTS, ap.front);
  },

  /**
   * @param {Equipment} eq
   * @param {Inventory} inv
   * @param {string[]} slotNames
   * @param {AppearanceLayer[]} out
   */
  _collect(eq, inv, slotNames, out) {
    for (const slotName of slotNames) {
      const uid = eq.slots[slotName];
      if (uid === undefined || uid === "") continue;
      const s = InventorySystem.findByUid(inv, uid);
      if (s === undefined) continue;
      const item = Item.get(s.itemId);
      const eqp =
        item !== undefined ? item.getComponent(Equippable) : undefined;
      if (eqp === undefined) continue;
      if (eqp.worn !== "") {
        // asset_get_index returns an opaque ref (not a number) — validate via sprite_exists
        const spr = asset_get_index(eqp.worn);
        if (sprite_exists(spr)) out.push({ sprite: spr, color: c_white });
      } else if (slotName === "weapon" && sprite_exists(item.sprite)) {
        // held-icon fallback: the item's own icon at the right hand's per-frame anchor
        // (RenderBillboard's anchored-layer branch; item.sprite is the ref RpgItems'
        // spr_item_<id> auto-wire resolved, -1 = none and sprite_exists rejects it)
        out.push({
          sprite: item.sprite,
          color: c_white,
          anchor: "handR",
          scale: this.HELD_SCALE,
        });
      }
    }
  },
};

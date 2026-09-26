/**
 * Items on the ground: an ItemDrop entity the player picks up like any station. An instance slot
 * keeps its uid and mods through the drop, so pickup re-inserts the same one.
 */
globalThis.Loot = {
  /** Scatter an entity's Inventory as ground drops; `opts` { yBase, ySpread }. */
  spill(entities, id, opts) {
    const inv = entities.get(id, Inventory);
    const pos = entities.get(id, Position);
    if (inv === undefined || pos === undefined) return;
    const yBase =
      opts !== undefined && opts.yBase !== undefined ? opts.yBase : 0;
    const ySpread =
      opts !== undefined && opts.ySpread !== undefined ? opts.ySpread : 24;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const ox = (i % 2 === 0 ? -1 : 1) * 32;
      const oy = (i < 2 ? -1 : 1) * ySpread;
      Loot.drop(entities, s.itemId, s.qty, pos.x + ox, pos.y + yBase + oy, s);
    }
  },

  /** A ground drop; an instance `src` slot records its uid and mods. */
  drop(entities, itemId, qty, x, y, src) {
    const id = entities.create();
    entities.add(id, Position, { x: x, y: y });
    // Matches the 32px icon drawn 1:1, so the pick outline lines up with the drop.
    entities.add(id, BBox, { x: -16, y: -16, width: 32, height: 32 });
    entities.add(id, Interaction, { kind: "pickup" });
    const drop = { itemId: itemId, qty: qty };
    if (src !== undefined && src.uid !== undefined) {
      drop.uid = src.uid;
      drop.mods = src.mods ?? {};
      if (src.ammo !== undefined) drop.ammo = src.ammo;
      if (src.rounds !== undefined) drop.rounds = src.rounds;
    }
    entities.add(id, ItemDrop, drop);
    entities.add(id, ParticleEmitter, {
      asset: "psDrop",
      color: InvTable.rarityColor(itemId),
    });
  },

  /**
   * Move a drop's payload into the player's bag, leaving any remainder on the ground; the drop
   * is removed (deferred) once emptied. Returns `{ itemId, qty, reason }`: `qty` taken, 0 with
   * `reason` "INV_FULL" for a refused bag.
   */
  pickup(entities, id, playerId) {
    const d = entities.require(id, ItemDrop);
    const inv = entities.require(playerId, Inventory);
    if (d.uid !== undefined) {
      const slot = {
        itemId: d.itemId,
        qty: 1,
        uid: d.uid,
        mods: d.mods ?? {},
      };
      if (d.ammo !== undefined) slot.ammo = d.ammo;
      if (d.rounds !== undefined) slot.rounds = d.rounds;
      if (Bag.addSlot(inv, slot) !== 0) {
        return { itemId: d.itemId, qty: 0, reason: "INV_FULL" };
      }
      entities.remove(id);
      return { itemId: d.itemId, qty: 1, reason: "" };
    }
    const left = Bag.add(inv, d.itemId, d.qty);
    const got = d.qty - left;
    if (left <= 0) entities.remove(id);
    else d.qty = left;
    return { itemId: d.itemId, qty: got, reason: got > 0 ? "" : "INV_FULL" };
  },
};

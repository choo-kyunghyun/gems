/**
 * Items on the ground: an ItemDrop entity the player picks up like any station. An instance slot
 * keeps its uid and mods through the drop, so pickup re-inserts the same one.
 */
globalThis.Loot = {
  // world px a spilled slot lands off the body: across, alternating sides, and the default down
  SPILL_X: 32,
  SPILL_Y: 24,

  /** Scatter an entity's Inventory as ground drops; `opts` { yBase, ySpread }. */
  spill(entities, id, opts) {
    const inv = entities.get(id, Inventory);
    const pos = entities.get(id, Position);
    if (inv === undefined || pos === undefined) return;
    const yBase =
      opts !== undefined && opts.yBase !== undefined ? opts.yBase : 0;
    const ySpread =
      opts !== undefined && opts.ySpread !== undefined ? opts.ySpread : Loot.SPILL_Y;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const ox = (i % 2 === 0 ? -1 : 1) * Loot.SPILL_X;
      const oy = (i < 2 ? -1 : 1) * ySpread;
      Loot.drop(entities, s.itemId, s.qty, pos.x + ox, pos.y + yBase + oy, s);
    }
  },

  /** A ground drop; an instance `src` slot records its uid and mods. */
  drop(entities, itemId, qty, x, y, src) {
    const id = entities.create();
    entities.add(id, Position, { x: x, y: y });
    // One cell wide whatever the art's size, so a small item stays easy to pick.
    const c = LevelGrid.CELL;
    entities.add(id, BBox, { x: -c / 2, y: -c / 2, width: c, height: c });
    entities.add(id, Interaction, { kind: "pickup" });
    const drop = { itemId: itemId, qty: qty };
    if (src !== undefined && src.uid !== undefined) {
      drop.uid = src.uid;
      drop.mods = src.mods ?? {};
      if (src.ammo !== undefined) drop.ammo = src.ammo;
      if (src.rounds !== undefined) drop.rounds = src.rounds;
    }
    entities.add(id, ItemDrop, drop);
    // drawn as a body, frame 0 held; an unknown item draws the placeholder
    const it = Item.get(itemId);
    const spr = it !== undefined ? it.sprite : -1;
    const f = sprite_exists(spr) ? AssetMeta.fit(spr, 1) : 1;
    entities.add(id, Sprite, {
      sprite: spr,
      speed: 0,
      xscale: f,
      yscale: f,
      blend: it !== undefined ? it.tint : c_white,
    });
    // TODO: a stream particle marks the drop again once stream particles are authorable
  },

  /**
   * Lays one of a body's bag slots on the ground at its feet: the instance `uid`, else the stack of
   * `itemId` at slot `idx`. Worn gear leaves its equip slot first, so its effects are undone while
   * the bag still holds it. "" when dropped, else the i18n key of why.
   */
  discard(entities, id, itemId, uid, idx) {
    const inv = entities.require(id, Inventory);
    let i = -1;
    if (uid !== undefined) {
      for (let k = 0; k < inv.slots.length; k++) if (inv.slots[k].uid === uid) i = k;
    } else if (idx >= 0 && idx < inv.slots.length && inv.slots[idx].itemId === itemId) i = idx;
    if (i < 0) return "INV_NOT_OWNED";
    const eq = entities.get(id, Equipment);
    if (eq !== undefined && uid !== undefined)
      for (const slot in eq.slots) if (eq.slots[slot] === uid) Loadout.unequip(entities, id, slot);
    const s = inv.slots[i];
    inv.slots.splice(i, 1);
    const pos = entities.require(id, Position);
    Loot.drop(entities, s.itemId, s.qty, pos.x, pos.y, s);
    return "";
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

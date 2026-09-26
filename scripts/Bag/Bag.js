// Pure operations on an Inventory component, taken directly so any entity's inventory works.
// Stacks respect Item.stack; adds are capped by maxWeight.
globalThis.Bag = {
  weight(inv) {
    let total = 0;
    for (let i = 0; i < inv.slots.length; i++) {
      const def = Item.get(inv.slots[i].itemId);
      if (def !== undefined) total += def.weight * inv.slots[i].qty;
    }
    return total;
  },

  // Returns the amount that did NOT fit (0 = all added). Instances never stack — one fresh-uid
  // slot per unit; addSlot inserts an existing instance with its uid and mods.
  add(inv, itemId, qty = 1) {
    const def = Item.get(itemId);
    const max = def !== undefined ? def.stack : 99;
    const unitW = def !== undefined ? def.weight : 1;
    const instanced = def !== undefined && def.isInstanced();

    let accept = qty;
    if (inv.maxWeight !== undefined && unitW > 0) {
      const budget = inv.maxWeight - Bag.weight(inv);
      const room = budget > 0 ? Math.floor(budget / unitW) : 0;
      if (room < accept) accept = room;
    }
    let left = accept;

    // `mods` is a MAP { slotId -> attachmentId }, not an array
    if (instanced) {
      while (left > 0 && inv.slots.length < inv.capacity) {
        inv.slots.push({ itemId: itemId, qty: 1, uid: uuid(), mods: {} });
        left -= 1;
      }
      return left + (qty - accept);
    }

    for (let i = 0; i < inv.slots.length && left > 0; i++) {
      const s = inv.slots[i];
      if (s.itemId === itemId && s.qty < max) {
        const room = max - s.qty;
        const move = room < left ? room : left;
        s.qty += move;
        left -= move;
      }
    }

    while (left > 0 && inv.slots.length < inv.capacity) {
      const move = left < max ? left : max;
      inv.slots.push({ itemId: itemId, qty: move });
      left -= move;
    }

    return left + (qty - accept); // unfit-by-slots + weight-gate refused
  },

  /**
   * Insert a pre-existing slot by reference, preserving uid/mods; a fungible slot falls back to
   * add(). Returns the qty that did NOT fit, like add() — a boolean would misreport a partial
   * fungible add as total failure while units were already moved.
   */
  addSlot(inv, slot) {
    const def = Item.get(slot.itemId);
    const instanced = def !== undefined && def.isInstanced();
    if (!instanced) return Bag.add(inv, slot.itemId, slot.qty);

    const unitW = def !== undefined ? def.weight : 1;
    if (inv.maxWeight !== undefined && unitW > 0) {
      if (Bag.weight(inv) + unitW > inv.maxWeight) return slot.qty;
    }
    if (inv.slots.length >= inv.capacity) return slot.qty;
    if (slot.mods === undefined) slot.mods = {}; // tolerate a bare {itemId,qty,uid}
    if (slot.uid === undefined) slot.uid = uuid();
    inv.slots.push(slot);
    return 0;
  },

  /**
   * Move up to `amount` of slot `idx` from `src` to `dst`, capped at what fits; returns the amount
   * moved (0 = nothing fit). THE bag transfer rule: an INSTANCE moves whole by reference (its uid
   * and mods ride along — add() would mint a fresh one), a fungible stack moves as much as dst's
   * slots and weight allow, and a slot the move empties is spliced out. `amount` only bounds a
   * fungible stack; omit it for the whole stack.
   */
  transfer(src, dst, idx, amount) {
    if (idx < 0 || idx >= src.slots.length) return 0;
    const s = src.slots[idx];
    const def = Item.get(s.itemId);
    if (def !== undefined && def.isInstanced()) {
      if (Bag.addSlot(dst, s) !== 0) return 0; // dst full / weight-gated
      src.slots.splice(idx, 1);
      return 1;
    }
    const want = amount === undefined ? s.qty : Math.min(amount, s.qty);
    if (want <= 0) return 0;
    const moved = want - Bag.add(dst, s.itemId, want);
    if (moved <= 0) return 0; // dst full / weight-gated
    s.qty -= moved;
    if (s.qty <= 0) src.slots.splice(idx, 1);
    return moved;
  },

  /**
   * transfer() every slot of `src` into `dst` in slot order — the bulk Take / Store — leaving
   * behind what dst can't take (a partial stack stays). `opts.skip(slot)` excludes a slot (a
   * worn instance, a favorited item); `opts.onMoved(itemId, qty)` fires per stack moved.
   * Returns the total moved.
   */
  transferAll(src, dst, opts = {}) {
    let total = 0;
    let i = 0;
    while (i < src.slots.length) {
      const s = src.slots[i];
      if (opts.skip !== undefined && opts.skip(s)) {
        i++;
        continue;
      }
      const moved = Bag.transfer(src, dst, i);
      if (moved > 0) {
        total += moved;
        if (opts.onMoved !== undefined) opts.onMoved(s.itemId, moved);
      }
      // a moved-out slot shifts its successor into i; a partial or refused one stays put
      if (src.slots[i] === s) i++;
    }
    return total;
  },

  findByUid(inv, uid) {
    for (let i = 0; i < inv.slots.length; i++)
      if (inv.slots[i].uid === uid) return inv.slots[i];
    return undefined;
  },

  removeByUid(inv, uid) {
    for (let i = 0; i < inv.slots.length; i++) {
      if (inv.slots[i].uid === uid) {
        inv.slots.splice(i, 1);
        return true;
      }
    }
    return false;
  },

  // Remove qty of itemId across slots (back to front). Returns amount removed.
  remove(inv, itemId, qty = 1) {
    let left = qty;
    for (let i = inv.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = inv.slots[i];
      if (s.itemId !== itemId) continue;
      const take = s.qty < left ? s.qty : left;
      s.qty -= take;
      left -= take;
      if (s.qty <= 0) inv.slots.splice(i, 1);
    }
    return qty - left;
  },

  count(inv, itemId) {
    let n = 0;
    for (let i = 0; i < inv.slots.length; i++) {
      if (inv.slots[i].itemId === itemId) n += inv.slots[i].qty;
    }
    return n;
  },

  has(inv, itemId, qty = 1) {
    return Bag.count(inv, itemId) >= qty;
  },

  isEmpty(inv) {
    return inv.slots.length === 0;
  },

  /**
   * Tidy + sort in place: merge fungible stacks, order by CATEGORIES then rarer-first then itemId.
   * Reordering is safe — Equipment references by uid, not slot index. Instance slots kept individual
   * (uid/mods preserved); only fungibles merge.
   */
  sort(inv) {
    const counts = {}; // fungible itemId -> total qty
    const insts = {}; // instance itemId -> InventorySlot[]
    const ids = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const def = Item.get(s.itemId);
      const instanced = def !== undefined && def.isInstanced();
      if (counts[s.itemId] === undefined && insts[s.itemId] === undefined)
        ids.push(s.itemId);
      if (instanced) {
        if (insts[s.itemId] === undefined) insts[s.itemId] = [];
        insts[s.itemId].push(s);
      } else {
        counts[s.itemId] = (counts[s.itemId] ?? 0) + s.qty;
      }
    }

    // BUG: insertion sort, not Array.prototype.sort (docs/GMRT.md #15593)
    for (let i = 1; i < ids.length; i++) {
      const v = ids[i];
      let j = i - 1;
      while (j >= 0 && Bag._cmp(ids[j], v) > 0) {
        ids[j + 1] = ids[j];
        j--;
      }
      ids[j + 1] = v;
    }

    const slots = [];
    for (let i = 0; i < ids.length; i++) {
      const itemId = ids[i];
      if (insts[itemId] !== undefined) {
        const list = insts[itemId];
        for (let k = 0; k < list.length; k++) slots.push(list[k]);
        continue;
      }
      const def = Item.get(itemId);
      const max = def !== undefined ? def.stack : 99;
      let left = counts[itemId];
      while (left > 0) {
        const move = left < max ? left : max;
        slots.push({ itemId: itemId, qty: move });
        left -= move;
      }
    }
    inv.slots = slots;
  },

  /** The bag's categories in sort order; an item files under the first whose test it passes. */
  CATEGORIES: [
    { code: "weapon", key: "INV_CAT_WEAPON", test: (it) => it.hasComponent(Weapon) },
    { code: "gear", key: "INV_CAT_GEAR", test: (it) => it.hasComponent(Equippable) },
    {
      code: "consumable",
      key: "INV_CAT_CONSUMABLE",
      test: (it) => it.hasComponent(Consumable),
    },
    { code: "misc", key: "INV_CAT_MISC", test: (it) => true },
  ],

  /** The index into CATEGORIES of def `it`; an unknown def files as misc. */
  category(it) {
    const cats = Bag.CATEGORIES;
    if (it === undefined) return cats.length - 1;
    for (let i = 0; i < cats.length; i++) if (cats[i].test(it)) return i;
    return cats.length - 1;
  },

  _cmp(a, b) {
    const ca = Bag.category(Item.get(a));
    const cb = Bag.category(Item.get(b));
    if (ca !== cb) return ca < cb ? -1 : 1;
    const ra = Bag._rarityRank(a);
    const rb = Bag._rarityRank(b);
    if (ra !== rb) return ra > rb ? -1 : 1; // higher tier index = rarer = first
    return a < b ? -1 : a > b ? 1 : 0;
  },

  _rarityRank(itemId) {
    const def = Item.get(itemId);
    if (def === undefined) return -1;
    return Rarity.rank(def.rarity); // -1 if unknown
  },
};

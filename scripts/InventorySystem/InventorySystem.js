// Pure operations on an Inventory component (no world tick). An Inventory is
// { slots: [{ itemId, qty }], capacity, maxWeight? }. Stacking respects each
// Item's stack size; adds are also capped by maxWeight (Item.weight * qty).
// Methods take the component directly so any entity's inventory works.
globalThis.InventorySystem = {
  // Total weight currently carried (sum of Item.weight * qty over all slots).
  weight(inv) {
    let total = 0;
    for (let i = 0; i < inv.slots.length; i++) {
      const def = Item.get(inv.slots[i].itemId);
      if (def !== undefined) total += def.weight * inv.slots[i].qty;
    }
    return total;
  },

  // Add qty of itemId: clamps to the weight budget first, then tops up existing
  // stacks, then fills new slots up to capacity. Returns the amount that did NOT
  // fit (0 = everything was added) — refused by weight OR by slots alike.
  add(inv, itemId, qty = 1) {
    const def = Item.get(itemId);
    const max = def !== undefined ? def.stack : 99;
    const unitW = def !== undefined ? def.weight : 1;

    // Weight gate: cap the accepted qty to what maxWeight still allows.
    let accept = qty;
    if (inv.maxWeight !== undefined && unitW > 0) {
      const budget = inv.maxWeight - this.weight(inv);
      const room = budget > 0 ? Math.floor(budget / unitW) : 0;
      if (room < accept) accept = room;
    }
    let left = accept;

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

    // Leftover = unfit-by-slots plus whatever the weight gate refused.
    return left + (qty - accept);
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
    return this.count(inv, itemId) >= qty;
  },

  isEmpty(inv) {
    return inv.slots.length === 0;
  },

  // Tidy + sort in place: consolidate same-item stacks (up to each Item's stack size)
  // and order by category (weapon < armor < trinket < other-equip < consumable <
  // misc), then rarer first, then itemId. Equipment references items by id (not slot
  // index), so reordering is safe. Total quantities are preserved.
  sort(inv) {
    // Tally totals per itemId.
    const counts = {};
    const ids = [];
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (counts[s.itemId] === undefined) {
        counts[s.itemId] = 0;
        ids.push(s.itemId);
      }
      counts[s.itemId] += s.qty;
    }

    // Insertion sort (Array.prototype.sort is unused/untrusted on the GMRT runtime).
    for (let i = 1; i < ids.length; i++) {
      const v = ids[i];
      let j = i - 1;
      while (j >= 0 && this._cmp(ids[j], v) > 0) {
        ids[j + 1] = ids[j];
        j--;
      }
      ids[j + 1] = v;
    }

    // Rebuild slots in sorted order, merging into full stacks first.
    const slots = [];
    for (let i = 0; i < ids.length; i++) {
      const itemId = ids[i];
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

  // Compare two itemIds for sort(): category, then rarity (rarer first), then id.
  _cmp(a, b) {
    const ca = this._category(a);
    const cb = this._category(b);
    if (ca !== cb) return ca < cb ? -1 : 1;
    const ra = this._rarityRank(a);
    const rb = this._rarityRank(b);
    if (ra !== rb) return ra > rb ? -1 : 1; // higher tier index = rarer = first
    return a < b ? -1 : a > b ? 1 : 0;
  },

  _category(itemId) {
    const def = Item.get(itemId);
    if (def === undefined) return 5;
    if (def.hasComponent(Equippable)) {
      const slot = def.getComponent(Equippable).slot;
      if (slot === "weapon") return 0;
      if (slot === "armor") return 1;
      if (slot === "trinket") return 2;
      return 3; // other equip slot (e.g. backpack)
    }
    if (def.hasComponent(Consumable)) return 4;
    return 5; // misc
  },

  _rarityRank(itemId) {
    const def = Item.get(itemId);
    if (def === undefined) return -1;
    return Rarity.order.indexOf(def.rarity); // -1 if unknown
  },
};

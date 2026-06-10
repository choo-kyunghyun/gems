// Pure operations on an Inventory component (no world tick). An Inventory is
// { slots: [{ itemId, qty }], capacity }. Stacking respects each Item's stack
// size; methods take the component directly so any entity's inventory works.
globalThis.InventorySystem = {
  // Add qty of itemId: tops up existing stacks first, then fills new slots up to
  // capacity. Returns the amount that did NOT fit (0 = everything was added).
  add(inv, itemId, qty = 1) {
    const def = Item.get(itemId);
    const max = def !== undefined ? def.stack : 99;
    let left = qty;

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

    return left;
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
};

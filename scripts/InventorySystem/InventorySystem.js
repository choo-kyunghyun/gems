// Pure operations on an Inventory component (no world tick). Methods take the component directly so
// any entity's inventory works. Stacking respects Item.stack; adds capped by maxWeight.
globalThis.InventorySystem = {
  weight(inv) {
    let total = 0;
    for (let i = 0; i < inv.slots.length; i++) {
      const def = Item.get(inv.slots[i].itemId);
      if (def !== undefined) total += def.weight * inv.slots[i].qty;
    }
    return total;
  },

  // Add qty of itemId: weight gate → top up stacks → fill new slots. Returns the amount that did NOT
  // fit (0 = all added). Instances never stack — one fresh-uid slot per unit. MINTS new instances;
  // to insert a pre-existing instance preserving uid/mods (transfer/drop), use addSlot.
  add(inv, itemId, qty = 1) {
    const def = Item.get(itemId);
    const max = def !== undefined ? def.stack : 99;
    const unitW = def !== undefined ? def.weight : 1;
    const instanced = def !== undefined && def.isInstanced();

    // weight gate: cap accepted qty to what maxWeight allows.
    let accept = qty;
    if (inv.maxWeight !== undefined && unitW > 0) {
      const budget = inv.maxWeight - this.weight(inv);
      const room = budget > 0 ? Math.floor(budget / unitW) : 0;
      if (room < accept) accept = room;
    }
    let left = accept;

    // instances: one slot per unit, fresh uid + empty mods. `mods` is a MAP { slotId -> attachmentId }
    // (not an array); gun ammo/rounds added lazily by the firing path so this stays generic.
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
   * Insert a pre-existing slot preserving uid/mods (an instance moved by transfer/drop). Gated by
   * weight then a free slot. A fungible slot falls back to add(). Slot taken by reference.
   * Returns the qty that did NOT fit, like add() (0 = fully inserted) — a boolean would misreport
   * a partial fungible add as total failure while units were already moved (transfer duplication).
   */
  addSlot(inv, slot) {
    const def = Item.get(slot.itemId);
    const instanced = def !== undefined && def.isInstanced();
    if (!instanced) return this.add(inv, slot.itemId, slot.qty);

    // weight gate (one unit — instances are qty 1).
    const unitW = def !== undefined ? def.weight : 1;
    if (inv.maxWeight !== undefined && unitW > 0) {
      if (this.weight(inv) + unitW > inv.maxWeight) return slot.qty;
    }
    if (inv.slots.length >= inv.capacity) return slot.qty;
    if (slot.mods === undefined) slot.mods = {}; // tolerate a bare {itemId,qty,uid} (mods = slot map)
    if (slot.uid === undefined) slot.uid = uuid();
    inv.slots.push(slot);
    return 0;
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
    return this.count(inv, itemId) >= qty;
  },

  isEmpty(inv) {
    return inv.slots.length === 0;
  },

  /**
   * Tidy + sort in place: merge fungible stacks, order by category then rarer-first then itemId.
   * Reordering is safe — Equipment references by uid, not slot index. Instance slots kept individual
   * (uid/mods preserved); only fungibles merge.
   */
  sort(inv) {
    // tally fungible totals; keep instance slots whole, grouped by itemId.
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

    // BUG: [#15593] insertion sort, not Array.prototype.sort.
    for (let i = 1; i < ids.length; i++) {
      const v = ids[i];
      let j = i - 1;
      while (j >= 0 && this._cmp(ids[j], v) > 0) {
        ids[j + 1] = ids[j];
        j--;
      }
      ids[j + 1] = v;
    }

    // rebuild: instance slots verbatim, fungibles merged into full stacks.
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

  /**
   * Compare two itemIds for sort(): category, then rarity (rarer first), then id.
   */
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
    return Rarity.rank(def.rarity); // -1 if unknown
  },
};

// Buy / sell / price / restock logic for a Merchant (Gameplay/Trade). Pure operations over the
// Merchant component + the buyer's and merchant's Inventory components — no world tick of its own
// except `update` (the restock heartbeat a scene calls each frame). Currency-agnostic: the money is
// `merchant.currencyId` (a fungible item the player carries), so the kit names no specific currency.
//
// Prices: marketValue = round(Rarity.modify(rarity, item.value)); buy = ceil(market·buyMargin),
// sell = floor(market·sellMargin). buy/sell return { amount, reason } — `amount` transacted (0 = a
// no-op) and a "" / i18n-key `reason` so the UI can toast WHY nothing happened. See Merchant for the
// infinite-vs-finite split. Kills no items: an instance moves by reference (uid/mods preserved).
globalThis.TradeSystem = {
  // Rarity-scaled base value of an item (same formula the inventory "Value" column shows).
  marketValue(itemId) {
    const it = Item.get(itemId);
    if (it === undefined) return 0;
    return Math.round(Rarity.modify(it.rarity, it.value));
  },

  // Price the player PAYS to buy / RECEIVES to sell one unit, after the merchant's margins.
  buyPrice(m, itemId) {
    return Math.ceil(TradeSystem.marketValue(itemId) * m.buyMargin);
  },
  sellPrice(m, itemId) {
    return Math.floor(TradeSystem.marketValue(itemId) * m.sellMargin);
  },

  // Player buys `qty` (an instance is always 1) of the merchant's stock slot `idx`. Clamps to what
  // the player can afford, the available stock (finite), and the buyer's free room — buys as much as
  // fits. Returns { amount, reason }; reason is set only when amount is 0 (NO_FUNDS / NO_ROOM).
  buy(world, buyerId, merchantId, idx, qty) {
    const m = world.get(Merchant, merchantId);
    const mInv = world.get(Inventory, merchantId);
    const bInv = world.get(Inventory, buyerId);
    if (m === undefined || mInv === undefined || bInv === undefined)
      return { amount: 0, reason: "" };
    const slot = mInv.slots[idx];
    if (slot === undefined) return { amount: 0, reason: "" };
    const itemId = slot.itemId;
    const def = Item.get(itemId);
    const instanced = def !== undefined && def.isInstanced();
    const price = TradeSystem.buyPrice(m, itemId);

    let want = instanced ? 1 : Math.max(1, qty);
    if (!m.infinite && !instanced) want = Math.min(want, slot.qty); // finite stock cap
    const coins = InventorySystem.count(bInv, m.currencyId);
    const affordable = price > 0 ? Math.floor(coins / price) : want;
    want = Math.min(want, affordable);
    if (want <= 0) return { amount: 0, reason: "TRADE_NO_FUNDS" };

    let bought = 0;
    if (instanced) {
      if (m.infinite) {
        // Bottomless catalog: mint a fresh copy (new uid, no mods) into the buyer.
        if (InventorySystem.add(bInv, itemId, 1) !== 0)
          return { amount: 0, reason: "TRADE_NO_ROOM" };
      } else {
        // Move the actual stock slot by reference so its uid + installed mods survive.
        if (!InventorySystem.addSlot(bInv, slot))
          return { amount: 0, reason: "TRADE_NO_ROOM" };
        mInv.slots.splice(idx, 1);
      }
      bought = 1;
    } else {
      const leftover = InventorySystem.add(bInv, itemId, want);
      bought = want - leftover;
      if (bought <= 0) return { amount: 0, reason: "TRADE_NO_ROOM" };
      if (!m.infinite) {
        slot.qty -= bought;
        if (slot.qty <= 0) mInv.slots.splice(idx, 1);
      }
    }

    InventorySystem.remove(bInv, m.currencyId, bought * price); // pay
    if (!m.infinite) m.credits += bought * price; // merchant's till (ignored when infinite)
    return { amount: bought, reason: "" };
  },

  // Player sells `qty` (an instance is always 1) of their own bag slot `idx` to the merchant. A
  // finite merchant must afford it (gated by `credits`) and have room for the buyback (adds it to its
  // stock); an infinite merchant always pays and discards the item. The seller is paid in currency.
  // Returns { amount, reason } (MERCHANT_BROKE / MERCHANT_FULL when 0). Equip/favorite protection is
  // the caller's (TradeUI) — this is pure mechanics. The currency item itself is never sellable.
  sell(world, sellerId, merchantId, idx, qty) {
    const m = world.get(Merchant, merchantId);
    const mInv = world.get(Inventory, merchantId);
    const sInv = world.get(Inventory, sellerId);
    if (m === undefined || mInv === undefined || sInv === undefined)
      return { amount: 0, reason: "" };
    const slot = sInv.slots[idx];
    if (slot === undefined) return { amount: 0, reason: "" };
    const itemId = slot.itemId;
    if (itemId === m.currencyId) return { amount: 0, reason: "" }; // can't sell money
    const def = Item.get(itemId);
    const instanced = def !== undefined && def.isInstanced();
    const price = TradeSystem.sellPrice(m, itemId);

    let want = instanced ? 1 : Math.max(1, Math.min(qty, slot.qty));
    if (!m.infinite) {
      const afford = price > 0 ? Math.floor(m.credits / price) : want;
      want = Math.min(want, afford);
      if (want <= 0) return { amount: 0, reason: "TRADE_MERCHANT_BROKE" };
    }

    let sold = 0;
    if (instanced) {
      if (!m.infinite && !InventorySystem.addSlot(mInv, slot)) // buyback into stock
        return { amount: 0, reason: "TRADE_MERCHANT_FULL" };
      sInv.slots.splice(idx, 1); // the instance left the bag (moved by ref / discarded)
      sold = 1;
    } else {
      if (!m.infinite) {
        const leftover = InventorySystem.add(mInv, itemId, want);
        sold = want - leftover;
        if (sold <= 0) return { amount: 0, reason: "TRADE_MERCHANT_FULL" };
      } else {
        sold = want;
      }
      slot.qty -= sold;
      if (slot.qty <= 0) sInv.slots.splice(idx, 1);
    }

    InventorySystem.add(sInv, m.currencyId, sold * price); // pay the seller
    if (!m.infinite) m.credits -= sold * price; // merchant's till
    return { amount: sold, reason: "" };
  },

  // Restock heartbeat: every `restockSecs` top each finite merchant's stock back UP to its `template`
  // baseline (never removes — player-sold extras stay for buyback). Called once per frame by the
  // scene with sim dt (so it pauses with the game). Infinite / restock-less merchants are skipped.
  update(world, dt) {
    const ids = world.query(Merchant, Inventory);
    for (let i = 0; i < ids.length; i++) {
      const m = world.get(Merchant, ids[i]);
      if (m === undefined || m.infinite) continue;
      if (m.restockSecs <= 0 || m.template === undefined) continue;
      m.restockTimer -= dt;
      if (m.restockTimer > 0) continue;
      m.restockTimer = m.restockSecs;
      const inv = world.get(Inventory, ids[i]);
      if (inv === undefined) continue;
      for (let k = 0; k < m.template.length; k++) {
        const t = m.template[k];
        const have = InventorySystem.count(inv, t.itemId);
        if (have < t.qty) InventorySystem.add(inv, t.itemId, t.qty - have);
      }
    }
  },
};

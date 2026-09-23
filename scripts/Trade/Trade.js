/**
 * Buying, selling and pricing for a merchant.
 *
 * A price is the rarity-scaled value times the merchant's margin, rounded in the merchant's
 * favour. buy/sell return { amount, reason } — `reason` an i18n key (or "") saying why nothing
 * happened. An instance moves by reference, so its uid and mods survive.
 */
globalThis.Trade = {
  marketValue(itemId) {
    const it = Item.get(itemId);
    if (it === undefined) return 0;
    return Math.round(Rarity.modify(it.rarity, it.value));
  },

  buyPrice(m, itemId) {
    return Math.ceil(Trade.marketValue(itemId) * m.buyMargin);
  },
  sellPrice(m, itemId) {
    return Math.floor(Trade.marketValue(itemId) * m.sellMargin);
  },

  /**
   * Buy up to `qty` of stock slot `idx` (an instance is always 1) — as much as is affordable,
   * available and fits. `reason` is set only when amount is 0.
   */
  buy(entities, buyerId, merchantId, idx, qty) {
    const m = entities.require(merchantId, Merchant);
    const mInv = entities.require(merchantId, Inventory);
    const bInv = entities.require(buyerId, Inventory);
    const slot = mInv.slots[idx];
    if (slot === undefined) return { amount: 0, reason: "" };
    const itemId = slot.itemId;
    const def = Item.get(itemId);
    const instanced = def !== undefined && def.isInstanced();
    const price = Trade.buyPrice(m, itemId);

    let want = instanced ? 1 : Math.max(1, qty);
    if (!m.infinite && !instanced) want = Math.min(want, slot.qty);
    const coins = Bag.count(bInv, m.currencyId);
    const affordable = price > 0 ? Math.floor(coins / price) : want;
    want = Math.min(want, affordable);
    if (want <= 0) return { amount: 0, reason: "TRADE_NO_FUNDS" };

    let bought = 0;
    if (instanced) {
      if (m.infinite) {
        // a bottomless catalog mints a fresh copy
        if (Bag.add(bInv, itemId, 1) !== 0)
          return { amount: 0, reason: "TRADE_NO_ROOM" };
      } else {
        if (Bag.addSlot(bInv, slot) !== 0)
          return { amount: 0, reason: "TRADE_NO_ROOM" };
        mInv.slots.splice(idx, 1);
      }
      bought = 1;
    } else {
      const leftover = Bag.add(bInv, itemId, want);
      bought = want - leftover;
      if (bought <= 0) return { amount: 0, reason: "TRADE_NO_ROOM" };
      if (!m.infinite) {
        slot.qty -= bought;
        if (slot.qty <= 0) mInv.slots.splice(idx, 1);
      }
    }

    Bag.remove(bInv, m.currencyId, bought * price);
    if (!m.infinite) m.credits += bought * price;
    return { amount: bought, reason: "" };
  },

  /**
   * Sell up to `qty` of bag slot `idx` (an instance is always 1). A finite merchant must afford it
   * and have room for the buyback; an infinite one always pays and discards. Equip/favorite
   * protection is the caller's. The currency itself is never sellable.
   */
  sell(entities, sellerId, merchantId, idx, qty) {
    const m = entities.require(merchantId, Merchant);
    const mInv = entities.require(merchantId, Inventory);
    const sInv = entities.require(sellerId, Inventory);
    const slot = sInv.slots[idx];
    if (slot === undefined) return { amount: 0, reason: "" };
    const itemId = slot.itemId;
    if (itemId === m.currencyId) return { amount: 0, reason: "" };
    const def = Item.get(itemId);
    const instanced = def !== undefined && def.isInstanced();
    const price = Trade.sellPrice(m, itemId);

    let want = instanced ? 1 : Math.max(1, Math.min(qty, slot.qty));
    if (!m.infinite) {
      const afford = price > 0 ? Math.floor(m.credits / price) : want;
      want = Math.min(want, afford);
      if (want <= 0) return { amount: 0, reason: "TRADE_MERCHANT_BROKE" };
    }

    let sold = 0;
    if (instanced) {
      if (!m.infinite && Bag.addSlot(mInv, slot) !== 0)
        return { amount: 0, reason: "TRADE_MERCHANT_FULL" };
      sInv.slots.splice(idx, 1);
      sold = 1;
    } else {
      if (!m.infinite) {
        const leftover = Bag.add(mInv, itemId, want);
        sold = want - leftover;
        if (sold <= 0) return { amount: 0, reason: "TRADE_MERCHANT_FULL" };
      } else {
        sold = want;
      }
      slot.qty -= sold;
      if (slot.qty <= 0) sInv.slots.splice(idx, 1);
    }

    // all-or-nothing: a payout that doesn't fit reverts the whole sale, so a full bag never
    // loses value to a sale
    const payout = sold * price;
    const unpaid = Bag.add(sInv, m.currencyId, payout);
    if (unpaid > 0) {
      Bag.remove(sInv, m.currencyId, payout - unpaid);
      if (instanced) {
        sInv.slots.splice(idx, 0, slot);
        if (!m.infinite) mInv.slots.pop(); // addSlot pushed it to the end
      } else {
        if (!m.infinite) Bag.remove(mInv, itemId, sold);
        Bag.add(sInv, itemId, sold); // always fits — the bag held these units at entry
      }
      return { amount: 0, reason: "TRADE_NO_ROOM" };
    }
    if (!m.infinite) m.credits -= payout;
    return { amount: sold, reason: "" };
  },
};

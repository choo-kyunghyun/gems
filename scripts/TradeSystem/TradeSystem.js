// Buy/sell/price/restock for a Merchant — pure ops over the Merchant + buyer's/merchant's Inventory;
// only `update` is a per-frame tick (restock heartbeat). Currency-agnostic (money = merchant.currencyId).
/**
 * Prices: marketValue = round(Rarity.modify(rarity, value)); buy = ceil(·buyMargin), sell =
 * floor(·sellMargin). buy/sell return { amount, reason } — reason is a ""/i18n key so the UI can toast
 * why nothing happened. An instance moves by reference (uid/mods preserved).
 */
globalThis.TradeSystem = {
  // rarity-scaled base value (same formula the inventory "Value" column shows).
  marketValue(itemId) {
    const it = Item.get(itemId);
    if (it === undefined) return 0;
    return Math.round(Rarity.modify(it.rarity, it.value));
  },

  // per-unit price after the merchant's margins.
  buyPrice(m, itemId) {
    return Math.ceil(TradeSystem.marketValue(itemId) * m.buyMargin);
  },
  sellPrice(m, itemId) {
    return Math.floor(TradeSystem.marketValue(itemId) * m.sellMargin);
  },

  // Buy `qty` (instance always 1) of stock slot `idx`, clamped to affordable / available / free room —
  // buys as much as fits. reason set only when amount is 0 (NO_FUNDS / NO_ROOM).
  buy(entities, buyerId, merchantId, idx, qty) {
    const m = entities.get(Merchant, merchantId);
    const mInv = entities.get(Inventory, merchantId);
    const bInv = entities.get(Inventory, buyerId);
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
        // bottomless catalog: mint a fresh copy (new uid, no mods).
        if (InventorySystem.add(bInv, itemId, 1) !== 0)
          return { amount: 0, reason: "TRADE_NO_ROOM" };
      } else {
        // move the stock slot by reference so its uid + mods survive.
        if (InventorySystem.addSlot(bInv, slot) !== 0)
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
    if (!m.infinite) m.credits += bought * price; // merchant's till
    return { amount: bought, reason: "" };
  },

  // Sell `qty` (instance always 1) of bag slot `idx`. Finite merchant must afford it (gated by `credits`)
  // + have room for the buyback; infinite always pays and discards. reason when 0 = MERCHANT_BROKE/FULL.
  // Equip/favorite protection is the caller's (TradeUI). The currency item itself is never sellable.
  sell(entities, sellerId, merchantId, idx, qty) {
    const m = entities.get(Merchant, merchantId);
    const mInv = entities.get(Inventory, merchantId);
    const sInv = entities.get(Inventory, sellerId);
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
      if (!m.infinite && InventorySystem.addSlot(mInv, slot) !== 0)
        // buyback into stock
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

    // pay the seller — all-or-nothing: an unfit payout reverts the whole sale instead of
    // silently discarding the coins (a slot-starved bag must never lose value to a sale).
    const payout = sold * price;
    const unpaid = InventorySystem.add(sInv, m.currencyId, payout);
    if (unpaid > 0) {
      InventorySystem.remove(sInv, m.currencyId, payout - unpaid); // take back the partial payment
      if (instanced) {
        sInv.slots.splice(idx, 0, slot); // the instance returns to its bag position
        if (!m.infinite) mInv.slots.pop(); // undo the buyback (addSlot pushes to the end)
      } else {
        if (!m.infinite) InventorySystem.remove(mInv, itemId, sold);
        InventorySystem.add(sInv, itemId, sold); // always fits — the bag held these units at entry
      }
      return { amount: 0, reason: "TRADE_NO_ROOM" };
    }
    if (!m.infinite) m.credits -= payout; // merchant's till
    return { amount: sold, reason: "" };
  },

  // Restock heartbeat: every `restockSecs` top each finite merchant's stock UP to `template` (never
  // removes — sold extras stay for buyback). Called per frame with sim dt (pauses with the game).
  update(entities, dt) {
    const ids = entities.query(Merchant, Inventory);
    for (let i = 0; i < ids.length; i++) {
      const m = entities.get(Merchant, ids[i]);
      if (m === undefined || m.infinite) continue;
      if (m.restockSecs <= 0 || m.template === undefined) continue;
      m.restockTimer -= dt;
      if (m.restockTimer > 0) continue;
      m.restockTimer = m.restockSecs;
      const inv = entities.get(Inventory, ids[i]);
      if (inv === undefined) continue;
      for (let k = 0; k < m.template.length; k++) {
        const t = m.template[k];
        const have = InventorySystem.count(inv, t.itemId);
        if (have < t.qty) InventorySystem.add(inv, t.itemId, t.qty - have);
      }
    }
  },
};

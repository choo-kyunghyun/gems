// The restock heartbeat over every finite Merchant; the trade verbs (buy/sell/price) are Trade's.
globalThis.TradeSystem = {
  /**
   * Every `restockSecs` top each finite merchant's stock UP to `template` (never removes — sold
   * extras stay for buyback). Called per frame with sim dt (pauses with the game).
   */
  update(level) {
    const entities = level.entities;
    const dt = Time.delta;
    entities.forEach([Merchant, Inventory], (id, m, inv) => {
      if (m.infinite) return;
      if (m.restockSecs <= 0 || m.template === undefined) return;
      m.restockTimer -= dt;
      if (m.restockTimer > 0) return;
      m.restockTimer = m.restockSecs;
      for (let k = 0; k < m.template.length; k++) {
        const t = m.template[k];
        const have = Bag.count(inv, t.itemId);
        if (have < t.qty) Bag.add(inv, t.itemId, t.qty - have);
      }
    });
  },
};

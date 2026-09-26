// The restock over every finite Merchant, on world hours.
globalThis.TradeSystem = {
  /**
   * Once the world passes a merchant's `restockAt`, top its stock up to `template` and set the
   * next one `restockHours` on; nothing is removed, so sold extras stay for buyback. A restock
   * falls due while its map is parked and lands on the first tick back.
   */
  update(level) {
    const now = WorldClock.absHours();
    level.entities.forEach([Merchant, Inventory], (id, m, inv) => {
      if (m.infinite) return;
      if (m.restockHours <= 0 || m.template === undefined) return;
      if (now < m.restockAt) return;
      m.restockAt = now + m.restockHours;
      for (let k = 0; k < m.template.length; k++) {
        const t = m.template[k];
        const have = Bag.count(inv, t.itemId);
        if (have < t.qty) Bag.add(inv, t.itemId, t.qty - have);
      }
    });
  },
};

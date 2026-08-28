// Exposure need driver — the thin-air rule over the shared Survival core: under the open sky the meter
// rises, cut by the seal of the gear worn; sheltered (RoomSystem.sheltered) it recovers. update() in the
// tick loop, after the room mirror is synced (RoomSystem.sync). Takes the scene (the map's rooms).
globalThis.ExposureSystem = {
  update(scene) {
    const entities = scene.level.entities;
    entities.forEach([Exposure, Position], (id, c, pos) => {
      let rate;
      if (RoomSystem.sheltered(scene, pos.x, pos.y)) rate = -c.recover;
      else rate = c.rate * (1 - ExposureSystem.seal(entities, id));
      Survival.step(entities, id, c, rate);
    });
  },

  /** The best seal among the gear an entity wears (Equippable.seal, 0..1); 0 with no Equipment. */
  seal(entities, id) {
    const eq = entities.get(id, Equipment);
    const inv = entities.get(id, Inventory);
    if (eq === undefined) return 0;
    if (inv === undefined) return 0;
    let best = 0;
    for (const slot in eq.slots) {
      const uid = eq.slots[slot];
      if (uid === "") continue;
      const s = InventorySystem.findByUid(inv, uid);
      if (s === undefined) continue;
      const item = Item.get(s.itemId);
      if (item === undefined) continue;
      const e = item.getComponent(Equippable);
      if (e === undefined) continue;
      if (e.seal > best) best = e.seal;
    }
    return best;
  },
};

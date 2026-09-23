/**
 * Swappable stat model from attributes to derived Stats.
 *
 * Game-side: it names the colony sheet. Stats are always rebuilt from source — attributes, gear,
 * installed attachments and statuses — so they can't drift.
 */
globalThis.StatModel = {
  ATTRS: [
    { id: "pow", name: "ATTR_POW", default: 2 },
    { id: "vit", name: "ATTR_VIT", default: 3 },
    { id: "agi", name: "ATTR_AGI", default: 5 },
    { id: "end", name: "ATTR_END", default: 6 },
  ],

  defaults() {
    const a = {};
    for (let i = 0; i < StatModel.ATTRS.length; i++) {
      const def = StatModel.ATTRS[i];
      a[def.id] = def.default;
    }
    return a;
  },

  derive(a) {
    return {
      maxHp: 4 + a.vit * 2,
      attack: Math.floor(a.pow / 2),
      defense: Math.floor(a.vit / 4),
      speed: 320 + a.agi * 24,
      maxStamina: 40 + a.end * 10,
    };
  },

  /**
   * A no-op without Attributes: such an entity authors its Stats directly. Clamps Health and
   * Stamina down to the new maxima.
   */
  recompute(entities, id) {
    const attrs = entities.get(id, Attributes);
    if (attrs === undefined) return;
    const stats = entities.require(id, Stats);
    const d = StatModel.derive(attrs);
    StatModel._foldEquipment(entities, id, d);
    StatModel._foldStatuses(entities, id, d);
    stats.maxHp = d.maxHp;
    stats.attack = d.attack;
    stats.defense = d.defense;
    stats.speed = d.speed;
    stats.maxStamina = d.maxStamina;
    // a raised maximum doesn't free-heal
    const hp = entities.get(id, Health);
    if (hp !== undefined && hp.hp > stats.maxHp) hp.hp = stats.maxHp;
    const stam = entities.get(id, Stamina);
    if (stam !== undefined && stam.value > stats.maxStamina)
      stam.value = stats.maxStamina;
  },

  _foldEquipment(entities, id, d) {
    const eq = entities.get(id, Equipment);
    if (eq === undefined) return;
    const inv = entities.get(id, Inventory);
    if (inv === undefined) return;
    const slots = eq.slots;
    for (const slot in slots) {
      const uid = slots[slot]; // an instance uid, not an itemId
      if (uid === undefined || uid === "") continue;
      const inst = Bag.findByUid(inv, uid);
      if (inst === undefined) continue;
      const item = Item.get(inst.itemId);
      if (item === undefined) continue;
      const eqp = item.getComponent(Equippable);
      if (eqp !== undefined && eqp.mods !== undefined) {
        for (const key in eqp.mods) {
          if (d[key] !== undefined) d[key] += eqp.mods[key];
        }
      }
      StatModel._foldInstanceMods(inst.mods, d);
    }
  },

  _foldInstanceMods(mods, d) {
    if (mods === undefined) return;
    for (const slotId in mods) {
      const m = Item.get(mods[slotId]);
      const wm = m !== undefined ? m.getComponent(WeaponMod) : undefined;
      if (wm === undefined) continue;
      for (const key in wm.stat) {
        if (d[key] !== undefined) d[key] += wm.stat[key];
      }
    }
  },

  /** Multiplier statuses are not folded; they apply at the point of use. */
  _foldStatuses(entities, id, d) {
    const eff = entities.get(id, StatusEffects);
    if (eff === undefined) return;
    const list = eff.list;
    for (let i = 0; i < list.length; i++) {
      const def = Status.get(list[i].id);
      if (def === undefined || def.mods === undefined) continue;
      const mods = def.mods;
      for (const key in mods) {
        if (d[key] !== undefined) d[key] += mods[key];
      }
    }
  },
};

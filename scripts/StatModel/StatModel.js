// Swappable stat model: rewrite ATTRS + derive() to change the attribute set (D&D-6, SPECIAL, …)
// without touching anything downstream — combat reads derived Stats only, via Combat's injected mitigate.
// Demo-side (names the RPG sheet, like CombatAI). Lean 4-attr set: POW→attack, VIT→maxHp, AGI→speed, END→maxStamina.
globalThis.StatModel = {
  // defaults tuned so derive() reproduces the legacy player sheet exactly
  ATTRS: [
    { id: "pow", name: "ATTR_POW", default: 2 },
    { id: "vit", name: "ATTR_VIT", default: 3 },
    { id: "agi", name: "ATTR_AGI", default: 5 },
    { id: "end", name: "ATTR_END", default: 6 },
  ],

  // fresh attribute bag from defaults; RpgPlayer.spawn uses this
  defaults() {
    const a = {};
    for (let i = 0; i < StatModel.ATTRS.length; i++) {
      const def = StatModel.ATTRS[i];
      a[def.id] = def.default;
    }
    return a;
  },

  // derive combat stats from attrs. default values → maxHp 10, attack 1, defense 0, speed 440, maxStamina 100
  // (the pre-attribute sheet at 32px-cell scale). swap formulas + ATTRS to re-model.
  derive(a) {
    return {
      maxHp: 4 + a.vit * 2,
      attack: Math.floor(a.pow / 2),
      defense: Math.floor(a.vit / 4),
      speed: 320 + a.agi * 24,
      maxStamina: 40 + a.end * 10,
    };
  },

  // recompute-from-source: rebuild Stats each call so it can't drift. no-op without Attributes
  // (monsters author Stats directly). clamps Health/Stamina to new maxima.
  recompute(entities, id) {
    const attrs = entities.get(Attributes, id);
    if (attrs === undefined) return; // monster with authored Stats — leave alone
    const stats = entities.get(Stats, id);
    if (stats === undefined) return;
    const d = StatModel.derive(attrs);
    StatModel._foldEquipment(entities, id, d);
    StatModel._foldStatuses(entities, id, d); // buff/debuff mods on top of gear
    stats.maxHp = d.maxHp;
    stats.attack = d.attack;
    stats.defense = d.defense;
    stats.speed = d.speed;
    stats.maxStamina = d.maxStamina;
    // clamp resources down if maxima shrank; a raise doesn't free-heal
    const hp = entities.get(Health, id);
    if (hp !== undefined && hp.hp > stats.maxHp) hp.hp = stats.maxHp;
    const stam = entities.get(Stamina, id);
    if (stam !== undefined && stam.value > stats.maxStamina)
      stam.value = stats.maxStamina;
  },

  // fold Equippable.mods into the derived block. for...in over plain object is GMRT-safe (no Map iterator).
  _foldEquipment(entities, id, d) {
    const eq = entities.get(Equipment, id);
    if (eq === undefined) return;
    const inv = entities.get(Inventory, id);
    if (inv === undefined) return;
    const slots = eq.slots;
    for (const slot in slots) {
      const uid = slots[slot]; // instance uid, not an itemId
      if (uid === undefined || uid === "") continue;
      const inst = InventorySystem.findByUid(inv, uid);
      if (inst === undefined) continue;
      const item = Item.get(inst.itemId);
      if (item === undefined) continue;
      const eqp = item.getComponent(Equippable);
      if (eqp !== undefined && eqp.mods !== undefined) {
        for (const key in eqp.mods) {
          if (d[key] !== undefined) d[key] += eqp.mods[key];
        }
      }
      // installed mods may also grant Stats via WeaponMod.stat
      StatModel._foldInstanceMods(inst.mods, d);
    }
  },

  // fold WeaponMod.stat deltas from installed attachments. for...in over plain object is GMRT-safe.
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

  // fold active status mods (e.g. fortify +attack/+defense) into d, same as _foldEquipment.
  // recompute-from-source: re-runs on apply/expire via StatusSystem.onStatsChanged hook.
  // live mult statuses (speed) are NOT folded — read at point of use via StatusSystem.scale.
  _foldStatuses(entities, id, d) {
    const eff = entities.get(StatusEffects, id);
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

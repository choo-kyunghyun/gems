// The game's STAT MODEL — the data-driven bridge from primary Attributes to the derived Stats the
// combat kit reads. THIS is the one place you swap to change the model: rewrite ATTRS + derive()
// for a D&D-6 (STR/DEX/CON/INT/WIS/CHA) or Fallout SPECIAL set and NOTHING else changes, because
// everything downstream (MeleeSystem/ProjectileSystem/Combat, the HUD, save/migration) reads the
// derived Stats, not the attributes. Demo-side (it names the RPG's Stats sheet, like CombatAI), so
// it isn't kit — the kit reads derived Stats only, via Combat's injected mitigate.
//
// This RPG uses a lean 4-attribute action set, each driving ONE derived stat it actually uses (no
// inert INT/WIS/CHA): POW→attack, VIT→maxHp (+ a little defense), AGI→speed, END→maxStamina.
globalThis.StatModel = {
  // The attribute set. id = the Attributes bag key; name = i18n display key; default = starting
  // value. Defaults are tuned so derive() reproduces the legacy player sheet (see derive).
  ATTRS: [
    { id: "pow", name: "ATTR_POW", default: 2 },
    { id: "vit", name: "ATTR_VIT", default: 3 },
    { id: "agi", name: "ATTR_AGI", default: 5 },
    { id: "end", name: "ATTR_END", default: 6 },
  ],

  // A fresh starting attribute bag from the defaults (RpgPlayer.spawn seeds the player with this).
  defaults() {
    const a = {};
    for (let i = 0; i < StatModel.ATTRS.length; i++) {
      const def = StatModel.ATTRS[i];
      a[def.id] = def.default;
    }
    return a;
  },

  // Derive the combat stats from an attribute bag. Tuned so the default attributes (POW2 / VIT3 /
  // AGI5 / END6) reproduce the pre-attribute player sheet EXACTLY: maxHp 10, attack 1, defense 0,
  // speed 220, maxStamina 100. Returns a flat block recompute folds equipment into, then writes to
  // Stats. (Swap these formulas + ATTRS to re-model; downstream reads the derived block, not this.)
  derive(a) {
    return {
      maxHp: 4 + a.vit * 2,
      attack: Math.floor(a.pow / 2),
      defense: Math.floor(a.vit / 4),
      speed: 160 + a.agi * 12,
      maxStamina: 40 + a.end * 10,
    };
  },

  // Recompute an entity's DERIVED Stats from its Attributes + equipped mods (recompute-from-source:
  // rebuilt from scratch each call, so it can't drift like the old +/- equip deltas). No-op for an
  // entity with no Attributes (a monster authors its Stats directly). Clamps current Health/Stamina
  // to the new maxima. Call on spawn, on equip/unequip, and on an attribute change (using a
  // *_shard consumable — the item-driven way attributes grow now that there's no leveling).
  recompute(world, id) {
    const attrs = world.get(Attributes, id);
    if (attrs === undefined) return; // not attribute-driven — leave authored Stats alone
    const stats = world.get(Stats, id);
    if (stats === undefined) return;
    const d = StatModel.derive(attrs);
    StatModel._foldEquipment(world, id, d);
    StatModel._foldStatuses(world, id, d); // active status `mods` (buffs/debuffs) on top of gear
    stats.maxHp = d.maxHp;
    stats.attack = d.attack;
    stats.defense = d.defense;
    stats.speed = d.speed;
    stats.maxStamina = d.maxStamina;
    // Resources (Tier 3) clamp to the new maxima — a maxHp/maxStamina drop shouldn't leave the
    // current value above it. A raise leaves the current value alone (no free heal here).
    const hp = world.get(Health, id);
    if (hp !== undefined && hp.hp > stats.maxHp) hp.hp = stats.maxHp;
    const stam = world.get(Stamina, id);
    if (stam !== undefined && stam.value > stats.maxStamina)
      stam.value = stats.maxStamina;
  },

  // Fold every equipped item's Equippable.mods (flat { stat: delta }) into the derived block `d`.
  // for...in over a plain object is GMRT-safe (no Map iterator). This replaces EquipmentSystem's
  // live +/- deltas — once wired (step 3) equip/unequip just re-run recompute.
  _foldEquipment(world, id, d) {
    const eq = world.get(Equipment, id);
    if (eq === undefined) return;
    const slots = eq.slots;
    for (const slot in slots) {
      const itemId = slots[slot];
      if (itemId === undefined || itemId === "") continue;
      const item = Item.get(itemId);
      if (item === undefined) continue;
      const eqp = item.getComponent(Equippable);
      if (eqp === undefined || eqp.mods === undefined) continue;
      const mods = eqp.mods;
      for (const key in mods) {
        if (d[key] !== undefined) d[key] += mods[key];
      }
    }
  },

  // Fold every ACTIVE status's flat `mods` (a buff/debuff like fortify's +attack/+defense) into the
  // derived block `d`, exactly like _foldEquipment. Mirrors the recompute-from-source contract: this
  // re-runs whenever StatusSystem applies/removes a mods-bearing status (via the injected
  // StatusSystem.onStatsChanged hook → recompute), so buffs can't drift. No-op without StatusEffects.
  // (A status's live `mult` is NOT folded here — it's read at point of use via StatusSystem.scale.)
  _foldStatuses(world, id, d) {
    const eff = world.get(StatusEffects, id);
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

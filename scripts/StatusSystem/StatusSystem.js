// Runs an entity's buffs/debuffs per tick — hot over time, duration countdown/expiry.
globalThis.StatusSystem = {
  /**
   * Iterates BACKWARDS for the in-place splice on expiry. Stats re-derive once per entity if any
   * expiring status carried `mods`.
   */
  update(level) {
    const entities = level.entities;
    entities.forEach([StatusEffects], (id, eff) => {
      const dt = Time.step;
      let modsExpired = false;
      for (let j = eff.list.length - 1; j >= 0; j--) {
        const inst = eff.list[j];
        const def = Status.get(inst.id);
        if (def === undefined) {
          eff.list.splice(j, 1); // unknown id (content unloaded)
          continue;
        }
        if (def.hot > 0) {
          inst.accum += dt;
          while (inst.accum >= def.interval) {
            inst.accum -= def.interval;
            StatusSystem._applyTick(entities, id, def);
          }
        }
        if (inst.remaining >= 0) {
          inst.remaining -= dt;
          if (inst.remaining <= 0) {
            eff.list.splice(j, 1);
            if (def.mods !== undefined) modsExpired = true;
          }
        }
      }
      if (modsExpired) Effects.onStatsChanged(entities, id);
    });
  },

  /** HoT clamps to max hp. */
  _applyTick(entities, id, def) {
    const hp = entities.get(id, Health);
    if (hp === undefined) return;
    const stats = entities.get(id, Stats);
    const cap =
      stats !== undefined ? stats.maxHp : hp.hp + def.hot * def.interval;
    hp.hp += def.hot * def.interval;
    if (hp.hp > cap) hp.hp = cap;
  },
};

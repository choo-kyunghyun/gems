// Runs an entity's buffs/debuffs per tick — dot/hot over time, duration countdown/expiry.
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
        if (def.dot > 0 || def.hot > 0) {
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

  /**
   * DoT bypasses mitigation — poison ignores armor; HoT clamps to max hp. Only changes hp — the
   * reaction to <=0 is not here.
   */
  _applyTick(entities, id, def) {
    const hp = entities.get(id, Health);
    if (hp === undefined) return;
    if (def.dot > 0) hp.hp -= def.dot * def.interval;
    if (def.hot > 0) {
      const stats = entities.get(id, Stats);
      const cap =
        stats !== undefined ? stats.maxHp : hp.hp + def.hot * def.interval;
      hp.hp += def.hot * def.interval;
      if (hp.hp > cap) hp.hp = cap;
    }
  },
};

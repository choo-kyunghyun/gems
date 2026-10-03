// Runs an entity's buffs/debuffs per tick — hp over time, duration countdown/expiry.
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
        if (def.hp !== 0) {
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
   * A gain clamps to max hp; a drain bypasses mitigation and only lowers hp — the reaction to <=0
   * is not here.
   */
  _applyTick(entities, id, def) {
    const hp = entities.get(id, Health);
    if (hp === undefined) return;
    hp.hp += def.hp * def.interval;
    if (def.hp < 0) return;
    const stats = entities.get(id, Stats);
    if (stats !== undefined && hp.hp > stats.maxHp) hp.hp = stats.maxHp;
  },
};

// Runs an entity's buffs/debuffs per tick — dot/hot over time, duration countdown/expiry. The
// on-demand verbs (apply/remove/maintain/list/scale) and the re-derive hook are Effects'.
globalThis.StatusSystem = {
  /**
   * Per-tick: advance dot/hot + durations, expire finished. Iterate BACKWARDS — in-place splice on expiry.
   * Re-derive once per entity if any expiring status carried `mods`.
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
          eff.list.splice(j, 1); // unknown id (content unloaded) — drop it
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
   * One interval's dot/hot on Health. DoT subtracts directly (bypasses Combat.mitigate — poison ignores
   * armor); HoT clamps to Stats.maxHp. Only changes hp — the <=0 reaction is the Mortal death pass.
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

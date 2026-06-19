// Runs the active buffs/debuffs on an entity: applies dot/hot over time, counts down durations,
// expires finished statuses, and answers the live multiplier query the mover reads. A plain system
// object (the project's System pattern, like EncumbranceSystem/StaminaSystem) — update(world) is the
// per-tick driver; the rest are on-demand verbs the game calls (apply/remove/maintain) or reads
// (has/list/scale). Operates on the StatusEffects component (added lazily on first apply/maintain).
//
// Stat-model coupling is via ONE injected hook, like Combat.mitigate: a status carrying flat `mods`
// only affects the derived Stats once the game re-derives, so apply/remove of a mods-bearing status
// calls StatusSystem.onStatsChanged (default no-op; the Demo wires StatModel.recompute in
// sceneRpg.create). dot/hot and live `mult` need no recompute — they act directly / are read live.
globalThis.StatusSystem = {
  // Injected: re-derive an entity's Stats after a status with flat `mods` was added/removed. Default
  // no-op (a consumer with no stat model, or statuses that only dot/hot/mult). Read off the global so
  // the game's override is always seen (mirrors Combat.mitigate / ConsumableSystem.grantAttr).
  onStatsChanged(world, id) {},

  // Add (or refresh) a timed/discrete status. `opts.duration` (seconds) overrides the def's duration;
  // a 0/undefined effective duration is a non-expiring status (until removed). Refreshing an active
  // status keeps the LONGER remaining (no magnitude stacking in the base — a future extension) and
  // resets nothing else. Triggers a Stats re-derive if the def carries `mods`. Returns false for an
  // unknown id.
  apply(world, id, statusId, opts) {
    const def = Status.get(statusId);
    if (def === undefined) return false;
    const eff = StatusSystem._ensure(world, id);
    const duration =
      opts !== undefined && opts.duration !== undefined
        ? opts.duration
        : def.duration;
    const remaining = duration > 0 ? duration : -1; // -1 = lasts until removed
    const i = StatusSystem._find(eff, statusId);
    if (i >= 0) {
      const inst = eff.list[i];
      inst.remaining =
        inst.remaining < 0 || remaining < 0
          ? -1
          : Math.max(inst.remaining, remaining);
    } else {
      eff.list.push({ id: statusId, remaining: remaining, accum: 0 });
    }
    if (def.mods !== undefined) StatusSystem.onStatsChanged(world, id);
    return true;
  },

  // Remove a status by id. Triggers a Stats re-derive if the def carried `mods`. Returns whether it
  // was present.
  remove(world, id, statusId) {
    const eff = world.get(StatusEffects, id);
    if (eff === undefined) return false;
    const i = StatusSystem._find(eff, statusId);
    if (i < 0) return false;
    eff.list.splice(i, 1);
    const def = Status.get(statusId);
    if (def !== undefined && def.mods !== undefined)
      StatusSystem.onStatsChanged(world, id);
    return true;
  },

  // Maintain a LIVE-driven status: `mult` (a { key: factor } map) ensures a permanent instance with
  // that dynamic magnitude; null/undefined removes it. The magnitude lives on the INSTANCE (overrides
  // the def's static `mult`), so the driver can refresh it each tick — this is the encumbrance path
  // (EncumbranceSystem.update feeds the weight gradient as { speed }). Never calls onStatsChanged: a
  // maintained status carries no `mods` (it's read live by scale()), so no re-derive is needed.
  maintain(world, id, statusId, mult) {
    if (mult === null || mult === undefined) {
      const eff = world.get(StatusEffects, id);
      if (eff === undefined) return;
      const i = StatusSystem._find(eff, statusId);
      if (i >= 0) eff.list.splice(i, 1);
      return;
    }
    const eff = StatusSystem._ensure(world, id);
    const i = StatusSystem._find(eff, statusId);
    if (i >= 0) {
      eff.list[i].mult = mult;
      eff.list[i].remaining = -1;
    } else {
      eff.list.push({ id: statusId, remaining: -1, accum: 0, mult: mult });
    }
  },

  has(world, id, statusId) {
    const eff = world.get(StatusEffects, id);
    return eff !== undefined && StatusSystem._find(eff, statusId) >= 0;
  },

  // The active status instances for an entity (the live array, or [] — for the HUD). Each entry's
  // static data is Status.get(entry.id); the entry carries remaining/accum/mult.
  list(world, id) {
    const eff = world.get(StatusEffects, id);
    return eff !== undefined ? eff.list : [];
  },

  // Combined multiplicative factor for one stat `key` across all active statuses (instance `mult`
  // override wins, else the def's static `mult`), default 1. The mover reads this for "speed", so a
  // speed status (encumbrance, slow, haste) composes by multiplication. Read live each use.
  scale(world, id, key) {
    const eff = world.get(StatusEffects, id);
    if (eff === undefined) return 1;
    let m = 1;
    for (let i = 0; i < eff.list.length; i++) {
      const inst = eff.list[i];
      let mult = inst.mult;
      if (mult === undefined) {
        const def = Status.get(inst.id);
        mult = def !== undefined ? def.mult : undefined;
      }
      if (mult !== undefined && mult[key] !== undefined) m *= mult[key];
    }
    return m;
  },

  // Per-tick driver: advance dot/hot (every `interval`) and durations, expire finished statuses.
  // Iterate the list BACKWARDS so an in-place splice on expiry is safe (no mutate-while-forward).
  // Re-derive once per entity if any expiring status carried `mods`.
  update(world) {
    const ids = world.query(StatusEffects);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const eff = world.get(StatusEffects, id);
      const dt = world.tickDuration;
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
            StatusSystem._applyTick(world, id, def);
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
      if (modsExpired) StatusSystem.onStatsChanged(world, id);
    }
  },

  // Apply one interval's worth of dot/hot to the entity's Health. DoT subtracts directly (bypasses
  // Combat.mitigate — poison ignores armor); HoT clamps to Stats.maxHp. Both only change hp — the
  // <=0 reaction is the Mortal death pass (RpgScene.resolveHealth), same as any damage source. No-op
  // for an entity without Health (e.g. a downed companion whose Health is detached).
  _applyTick(world, id, def) {
    const hp = world.get(Health, id);
    if (hp === undefined) return;
    if (def.dot > 0) hp.hp -= def.dot * def.interval;
    if (def.hot > 0) {
      const stats = world.get(Stats, id);
      const cap =
        stats !== undefined ? stats.maxHp : hp.hp + def.hot * def.interval;
      hp.hp += def.hot * def.interval;
      if (hp.hp > cap) hp.hp = cap;
    }
  },

  // Get-or-add the StatusEffects component for an entity.
  _ensure(world, id) {
    let eff = world.get(StatusEffects, id);
    if (eff === undefined) {
      eff = { list: [] };
      world.add(id, StatusEffects, eff);
    }
    return eff;
  },

  // Index of an active status by id, or -1.
  _find(eff, statusId) {
    for (let i = 0; i < eff.list.length; i++)
      if (eff.list[i].id === statusId) return i;
    return -1;
  },
};

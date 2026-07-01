// Runs an entity's buffs/debuffs: dot/hot over time, duration countdown/expiry, live multiplier query.
// update(world) is the per-tick driver; apply/remove/maintain/has/list/scale are on-demand verbs.
// Stat-model coupling is ONE injected hook (like Combat.mitigate): a `mods`-bearing status only affects
// derived Stats once the game re-derives, so apply/remove calls onStatsChanged (default no-op; Demo wires
// StatModel.recompute). dot/hot and live `mult` need no recompute — they act directly / are read live.
globalThis.StatusSystem = {
  // Injected re-derive hook (mirrors Combat.mitigate / ConsumableSystem.grantAttr). Default no-op; read
  // off the global so the game's override is always seen.
  onStatsChanged(world, id) {},

  // Add or refresh a timed status (opts.duration overrides the def; 0/undefined = non-expiring). Refresh
  // keeps the LONGER remaining (no magnitude stacking yet). Re-derives if the def carries `mods`.
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

  // Remove by id; re-derives if the def carried `mods`. Returns whether it was present.
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

  // Maintain a LIVE-driven status: `mult` ensures a permanent instance with that dynamic magnitude (lives
  // on the INSTANCE so the driver can refresh it each tick — the encumbrance path); null/undefined removes
  // it. Never re-derives — a maintained status carries no `mods`, it's read live by scale().
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

  // Live array of active instances (or []) — for the HUD. Static data via Status.get(entry.id).
  list(world, id) {
    const eff = world.get(StatusEffects, id);
    return eff !== undefined ? eff.list : [];
  },

  // Combined multiplicative factor for one stat `key` (instance `mult` wins over the def's), default 1.
  // The mover reads this for "speed" so speed statuses compose by multiplication. Read live each use.
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

  // Per-tick: advance dot/hot + durations, expire finished. Iterate BACKWARDS — in-place splice on expiry.
  // Re-derive once per entity if any expiring status carried `mods`.
  update(world) {
    const ids = world.query(StatusEffects);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const eff = world.get(StatusEffects, id);
      const dt = World.sim.tickDuration;
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

  // One interval's dot/hot on Health. DoT subtracts directly (bypasses Combat.mitigate — poison ignores
  // armor); HoT clamps to Stats.maxHp. Only changes hp — the <=0 reaction is the Mortal death pass.
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

  _ensure(world, id) {
    let eff = world.get(StatusEffects, id);
    if (eff === undefined) {
      eff = { list: [] };
      world.add(id, StatusEffects, eff);
    }
    return eff;
  },

  _find(eff, statusId) {
    for (let i = 0; i < eff.list.length; i++)
      if (eff.list[i].id === statusId) return i;
    return -1;
  },
};

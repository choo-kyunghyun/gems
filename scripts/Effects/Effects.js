/**
 * On-demand status verbs over an entity's StatusEffects.
 *
 * The stat model is coupled through one injected hook: a `mods`-bearing status affects derived
 * stats only once the game re-derives, so adding or removing one calls onStatsChanged. A live
 * `mult` needs no re-derive; it is read live.
 */
globalThis.Effects = {
  // injected re-derive hook, a no-op until a game overrides it; read off the global so the
  // override is always seen
  onStatsChanged(entities, id) {},

  /**
   * `opts.duration` overrides the def's; 0 never expires. A refresh keeps the longer remaining
   * time and never stacks magnitude.
   */
  apply(entities, id, statusId, opts) {
    const def = Status.get(statusId);
    if (def === undefined) return false;
    const eff = Effects._ensure(entities, id);
    const duration =
      opts !== undefined && opts.duration !== undefined
        ? opts.duration
        : def.duration;
    const remaining = duration > 0 ? duration : -1; // -1 = lasts until removed
    const i = Effects._find(eff, statusId);
    if (i >= 0) {
      const inst = eff.list[i];
      inst.remaining =
        inst.remaining < 0 || remaining < 0
          ? -1
          : Math.max(inst.remaining, remaining);
    } else {
      eff.list.push({ id: statusId, remaining: remaining, accum: 0 });
    }
    if (def.mods !== undefined) Effects.onStatsChanged(entities, id);
    return true;
  },

  /** Returns whether it was present. */
  remove(entities, id, statusId) {
    const eff = entities.get(id, StatusEffects);
    if (eff === undefined) return false;
    const i = Effects._find(eff, statusId);
    if (i < 0) return false;
    eff.list.splice(i, 1);
    const def = Status.get(statusId);
    if (def !== undefined && def.mods !== undefined)
      Effects.onStatsChanged(entities, id);
    return true;
  },

  /**
   * A live-driven status: `mult` lives on the instance so its driver can refresh it each tick;
   * null removes it. Never re-derives, since a maintained status carries no `mods`.
   */
  maintain(entities, id, statusId, mult) {
    if (mult === null || mult === undefined) {
      const eff = entities.get(id, StatusEffects);
      if (eff === undefined) return;
      const i = Effects._find(eff, statusId);
      if (i >= 0) eff.list.splice(i, 1);
      return;
    }
    const eff = Effects._ensure(entities, id);
    const i = Effects._find(eff, statusId);
    if (i >= 0) {
      eff.list[i].mult = mult;
      eff.list[i].remaining = -1;
    } else {
      eff.list.push({ id: statusId, remaining: -1, accum: 0, mult: mult });
    }
  },

  /** The live array of active instances; do not mutate it. */
  list(entities, id) {
    const eff = entities.get(id, StatusEffects);
    return eff !== undefined ? eff.list : [];
  },

  /** Statuses compose by multiplication; an instance's `mult` wins over its def's. */
  scale(entities, id, key) {
    const eff = entities.get(id, StatusEffects);
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

  _ensure(entities, id) {
    let eff = entities.get(id, StatusEffects);
    if (eff === undefined) {
      eff = {};
      entities.add(id, StatusEffects, eff);
    }
    return eff;
  },

  _find(eff, statusId) {
    for (let i = 0; i < eff.list.length; i++)
      if (eff.list[i].id === statusId) return i;
    return -1;
  },
};

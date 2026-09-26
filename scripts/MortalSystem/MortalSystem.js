const SPILL = { yBase: 0, ySpread: 28 }; // loot scatter for a "despawn" kill

/**
 * Death, resolved only here: damage just subtracts hp, and this is the sole authority that
 * removes, respawns, incapacitates or leaves a body, by the entity's opt-in `Mortal`. A kill is
 * reported by species; a respawn or a recovery lands at the map's spawn.
 */
globalThis.MortalSystem = {
  /**
   * A mortal at hp 0 reacts by its kind, the downed recover once their timer runs out, and
   * looted-empty corpses go. Runs before the flush, so a despawning body is still readable for
   * its loot and its kill report.
   */
  update(level) {
    MortalSystem._resolve(level);
    MortalSystem._recover(level);
    MortalSystem._reap(level);
  },

  _resolve(level) {
    const entities = level.entities;
    // query(), not forEach: the loop spawns entities and strips components.
    const ids = entities.query(Health, Mortal);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const hp = entities.get(id, Health);
      if (hp === undefined || hp.hp > 0) continue;
      const m = entities.get(id, Mortal);
      if (m.kind === "despawn") {
        Loot.spill(entities, id, SPILL);
        MortalSystem._killed(entities, id);
        entities.remove(id);
      } else if (m.kind === "corpse") {
        MortalSystem._killed(entities, id);
        MortalSystem._toCorpse(entities, id);
      } else if (m.kind === "respawn") {
        const st = entities.get(id, Stats);
        hp.hp = st !== undefined ? st.maxHp : (m.reviveHp ?? 10);
        MortalSystem._respawn(level, id);
        const base = entities.get(id, PrevHealth);
        if (base !== undefined) base.hp = hp.hp; // don't pop a "+heal" for the refill
      } else if (m.kind === "down") {
        MortalSystem._goDown(entities, id, m);
      }
    }
  },

  /** Reported while the body's components are still readable. */
  _killed(entities, id) {
    const dp = entities.get(id, Position);
    if (dp !== undefined)
      Audio.play({ sound: sndExplosionSmall, position: { x: dp.x, y: dp.y } });
    const kind = Mortality.species(entities, id);
    Progression.report(entities, "kill", kind, 1);
    Log.info(`${kind} killed — kills=${Tracker.count("enemiesKilled")}`);
  },

  /**
   * Back to the map's spawn, stopped, every need at mid-meter so the death clears the critical
   * debuff that caused it.
   */
  _respawn(level, id) {
    const entities = level.entities;
    MortalSystem._toSpawn(level, id);
    const needs = Need.all();
    for (let i = 0; i < needs.length; i++) {
      const need = entities.get(id, needs[i].id);
      if (need === undefined) continue; // a save from before the need
      Needs.set(entities, id, needs[i].id, need.max * 0.5);
    }
    Log.info("player died — respawned at spawn");
  },

  _toSpawn(level, id) {
    const entities = level.entities;
    const sp = ColonyMap.of(level).spawn;
    const pos = entities.get(id, Position);
    const vel = entities.get(id, Velocity);
    if (pos !== undefined) {
      pos.x = sp.x;
      pos.y = sp.y;
    }
    if (vel !== undefined) {
      vel.x = 0;
      vel.y = 0;
    }
  },

  /**
   * Incapacitate until the recovery timer runs out; without Health it is neither targeted nor
   * resolved again. Deliberately leaves squad membership alone, so being knocked out can't
   * silently shrink the player's bag.
   */
  _goDown(entities, id, m) {
    entities.detach(id, Health);
    const vel = entities.get(id, Velocity);
    if (vel !== undefined) {
      vel.x = 0;
      vel.y = 0;
    }
    // a body with no fallen pose dims instead
    if (!Doll.setState(entities, id, "down")) {
      const spr = entities.get(id, Sprite);
      if (spr !== undefined) spr.alpha = 0.4;
    }
    entities.add(id, Downed, { timer: m.recoverSecs ?? 6 });
    entities.detach(id, PrevHealth);
    Mortality.onDown(entities, id);
  },

  _recover(level) {
    const entities = level.entities;
    entities.forEach([Downed], (id, d) => {
      d.timer -= Time.step;
      if (d.timer > 0) return;
      const m = entities.get(id, Mortal);
      const reviveHp = m !== undefined ? (m.reviveHp ?? 1) : 1;
      entities.add(id, Health, { hp: reviveHp });
      if (!Doll.setState(entities, id, "idle")) {
        const spr = entities.get(id, Sprite);
        if (spr !== undefined) spr.alpha = 1;
      }
      MortalSystem._toSpawn(level, id);
      entities.detach(id, Downed);
      Mortality.onRecover(entities, id);
    });
  },

  /**
   * Transform the entity in place into a lootable body: strip the combatant and its species, make
   * it walk-over and tag it a "corpse" interaction over its Inventory. Keeping the same entity
   * means a save snapshots the corpse like any other resident.
   */
  _toCorpse(entities, id) {
    entities.detach(id, Health);
    entities.detach(id, Mortal);
    entities.detach(id, Stats);
    entities.detach(id, Brain);
    entities.detach(id, State);
    entities.detach(id, Velocity);
    entities.detach(id, Faction);
    const species = Mortality.SPECIES;
    for (let i = 0; i < species.length; i++) entities.detach(id, species[i].token);
    const col = entities.get(id, Collision);
    if (col !== undefined) col.solid = false; // BBox stays for cursor pick
    // A rig with an authored `down` set dies through it and holds its last pose; any other body
    // falls back to the crumple.
    if (!Doll.setState(entities, id, "down")) {
      const spr = entities.get(id, Sprite);
      if (spr !== undefined) {
        spr.alpha = 0.4;
        spr.yscale = Math.abs(spr.yscale) * 0.45; // |scale| carries the baked size
        Anim.rate(entities, id, 0);
      }
    }
    entities.add(id, Interaction, { kind: "corpse" });
    entities.detach(id, PrevHealth);
  },

  /** Deferred removal; a lootless kill reaps the same tick it corpses. */
  _reap(level) {
    const entities = level.entities;
    entities.forEach([Interaction], (id, it) => {
      if (it.kind !== "corpse") return;
      const inv = entities.get(id, Inventory);
      if (inv === undefined || inv.slots.length === 0) entities.remove(id);
    });
  },
};

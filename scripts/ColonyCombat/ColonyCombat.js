/**
 * Combat and loot flow for the colony scene.
 *
 * Allegiance and membership are live component queries, not stored lists, so a save restore or
 * squad transfer needs no bookkeeping; the damage-number baseline is the entity's own.
 *
 * Death is configured per entity by an opt-in `Mortal` and resolved only here: damage systems
 * just subtract hp, and this is the sole authority that removes, respawns, incapacitates or
 * leaves a body.
 */
globalThis.ColonyCombat = {
  _enemies(entities, playerId) {
    const out = [];
    // Faction joins the query: hostility needs one on both sides, so this skips the
    // factionless majority (docs/ARCHITECTURE.md).
    entities.forEach([Health, Faction], (id) => {
      if (Diplomacy.hostile(entities, playerId, id)) out.push(id);
    });
    return out;
  },

  /**
   * Pop a floating number for each combatant's hp change since last tick. Run after physics and
   * before deaths flush, so the killing blow still pops.
   */
  trackDamage(scene, yOffset) {
    ColonyCombat._diffHp(scene, scene.playerId, true, yOffset);
    const enemies = ColonyCombat._enemies(scene.level.entities, scene.playerId);
    for (let i = 0; i < enemies.length; i++)
      ColonyCombat._diffHp(scene, enemies[i], false, yOffset);
    scene.level.entities.forEach([Follower], (id) => {
      ColonyCombat._diffHp(scene, id, true, yOffset);
    });
    // Built structures are otherwise untracked; a double-diffed id is harmless.
    scene.level.entities.forEach([Health, Mesh], (id) => {
      ColonyCombat._diffHp(scene, id, true, yOffset);
    });
  },

  _diffHp(scene, id, isAlly, yOffset) {
    const entities = scene.level.entities;
    if (!entities.isValid(id)) return;
    const hp = entities.get(id, Health);
    if (hp === undefined) return;
    const base = entities.get(id, PrevHealth);
    if (base === undefined) {
      // first sight seeds, pops nothing
      entities.add(id, PrevHealth, { hp: hp.hp }, { mint: true });
      return;
    }
    const prev = base.hp;
    if (hp.hp !== prev) {
      const pos = entities.get(id, Position);
      if (pos !== undefined) {
        const d = hp.hp - prev;
        if (d < 0) {
          FloatingText.push(pos.x, pos.y - yOffset, -d, {
            type: isAlly ? "hurt" : "damage",
          });
          // An enemy's killing blow is left to the death pass's own sound.
          const at = { x: pos.x, y: pos.y };
          if (entities.has(id, Mesh))
            Audio.play({ sound: sndHitsoundMetal, position: at });
          else if (isAlly)
            Audio.play({ sound: sndHitsoundArmor, position: at });
          else if (hp.hp > 0)
            Audio.play({ sound: sndHitsoundFlesh, position: at });
        } else {
          FloatingText.push(pos.x, pos.y - yOffset, "+" + d, { type: "heal" });
        }
      }
    }
    base.hp = hp.hp;
  },

  /**
   * The death pass: a `Mortal` entity at hp 0 reacts by its `kind`. Runs before flush, so a
   * despawning entity is still readable for its loot. Only Mortal entities react. Handlers `h`
   * (all optional): spill { yBase, ySpread }, onKill(id) (before the body is transformed),
   * onRespawn(id), downSpot(id) → {x,y}, onDown(id).
   */
  resolveHealth(scene, h) {
    h = h ?? {};
    const entities = scene.level.entities;
    // query(), not forEach: the loop spawns entities and strips components.
    const ids = entities.query(Health, Mortal);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const hp = entities.get(id, Health);
      if (hp === undefined || hp.hp > 0) continue;
      const m = entities.get(id, Mortal);
      if (m.kind === "despawn") {
        ColonyCombat.spillLoot(scene, id, h.spill);
        if (h.onKill !== undefined) h.onKill(id);
        entities.remove(id);
      } else if (m.kind === "corpse") {
        if (h.onKill !== undefined) h.onKill(id);
        ColonyCombat._toCorpse(scene, id);
      } else if (m.kind === "respawn") {
        const st = entities.get(id, Stats);
        hp.hp = st !== undefined ? st.maxHp : (m.reviveHp ?? 10);
        if (h.onRespawn !== undefined) h.onRespawn(id);
        const base = entities.get(id, PrevHealth);
        if (base !== undefined) base.hp = hp.hp; // don't pop a "+heal" for the refill
      } else if (m.kind === "down") {
        ColonyCombat._goDown(scene, id, m, h);
      }
    }
  },

  /**
   * Incapacitate until the recovery timer runs out; without Health it is neither targeted nor
   * resolved again. Deliberately leaves squad membership alone, so being knocked out can't
   * silently shrink the player's bag.
   */
  _goDown(scene, id, m, h) {
    const entities = scene.level.entities;
    entities.detach(id, Health);
    const vel = entities.get(id, Velocity);
    if (vel !== undefined) {
      vel.x = 0;
      vel.y = 0;
    }
    const vis = entities.get(id, Visual);
    if (vis !== undefined) vis.alpha = 0.4;
    Doll.setState(entities, id, "down");
    entities.add(id, Downed, { timer: m.recoverSecs ?? 6 });
    entities.detach(id, PrevHealth);
    if (h.onDown !== undefined) h.onDown(id);
  },

  /** Revive each downed entity whose timer ran out, at `h.downSpot` when given. */
  updateDowned(scene, h) {
    h = h ?? {};
    const entities = scene.level.entities;
    entities.forEach([Downed], (id, d) => {
      d.timer -= Time.step;
      if (d.timer > 0) return;
      const m = entities.get(id, Mortal);
      const reviveHp = m !== undefined ? (m.reviveHp ?? 1) : 1;
      entities.add(id, Health, { hp: reviveHp });
      const vis = entities.get(id, Visual);
      if (vis !== undefined) vis.alpha = 1;
      Doll.setState(entities, id, "idle");
      const spot = h.downSpot !== undefined ? h.downSpot(id) : undefined;
      if (spot !== undefined) {
        const pos = entities.get(id, Position);
        const vel = entities.get(id, Velocity);
        if (pos !== undefined) {
          pos.x = spot.x;
          pos.y = spot.y;
        }
        if (vel !== undefined) {
          vel.x = 0;
          vel.y = 0;
        }
      }
      entities.detach(id, Downed);
      if (h.onRecover !== undefined) h.onRecover(id);
    });
  },

  /**
   * Transform the entity in place into a lootable body: strip the combatant, make it walk-over
   * and tag it a "corpse" interaction over its Inventory. Keeping the same entity means a save
   * snapshots the corpse like any other resident. Species markers are the scene's to drop in
   * onKill.
   */
  _toCorpse(scene, id) {
    const entities = scene.level.entities;
    entities.detach(id, Health);
    entities.detach(id, Mortal);
    entities.detach(id, Stats);
    entities.detach(id, Brain);
    entities.detach(id, State);
    entities.detach(id, Velocity);
    entities.detach(id, Faction);
    const col = entities.get(id, Collision);
    if (col !== undefined) col.solid = false; // BBox stays for cursor pick
    const vis = entities.get(id, Visual);
    if (vis !== undefined) {
      vis.alpha = 0.4;
      vis.speed = 0;
      vis.subimg = 0;
      vis.yscale = Math.abs(vis.yscale) * 0.45; // |scale| carries the baked size
    }
    // A rig with an authored `down` set dies through it and holds its last pose; one without
    // falls back to the crumple.
    const sk = entities.get(id, Skeleton);
    if (sk !== undefined) {
      const rig = Doll.RIGS[sprite_get_name(sk.sprite)];
      if (rig !== undefined && rig.down !== undefined) {
        Doll.setState(entities, id, "down");
      } else {
        sk.alpha = 0.4;
        sk.yscale = Math.abs(sk.yscale) * 0.45;
        Rig.apply(entities, id);
        Rig.rate(entities, id, 0);
      }
    }
    entities.add(id, Interaction, { kind: "corpse" });
    entities.detach(id, PrevHealth);
  },

  /** Remove looted-empty corpses (deferred); a lootless kill reaps the same tick it corpses. */
  reapCorpses(scene) {
    const entities = scene.level.entities;
    entities.forEach([Interaction], (id, it) => {
      if (it.kind !== "corpse") return;
      const inv = entities.get(id, Inventory);
      if (inv === undefined || inv.slots.length === 0) entities.remove(id);
    });
  },

  /** Scatter an enemy's Inventory as ground drops; `opts` { yBase, ySpread }. */
  spillLoot(scene, enemyId, opts) {
    const entities = scene.level.entities;
    const inv = entities.get(enemyId, Inventory);
    const pos = entities.get(enemyId, Position);
    if (inv === undefined || pos === undefined) return;
    const yBase =
      opts !== undefined && opts.yBase !== undefined ? opts.yBase : 0;
    const ySpread =
      opts !== undefined && opts.ySpread !== undefined ? opts.ySpread : 24;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const ox = (i % 2 === 0 ? -1 : 1) * 32;
      const oy = (i < 2 ? -1 : 1) * ySpread;
      ColonyCombat.spawnDrop(
        scene,
        s.itemId,
        s.qty,
        pos.x + ox,
        pos.y + yBase + oy,
        s,
      );
    }
  },

  /**
   * A ground drop the player picks up like any station. An instance `src` slot records its
   * uid and mods so pickup re-inserts the same one.
   */
  spawnDrop(scene, itemId, qty, x, y, src) {
    const entities = scene.level.entities;
    const id = entities.create();
    entities.add(id, Position, { x: x, y: y });
    // Matches the 32px icon drawn 1:1, so the pick outline lines up with the drop.
    entities.add(id, BBox, { x: -16, y: -16, width: 32, height: 32 });
    entities.add(id, Interaction, { kind: "pickup" });
    const drop = { itemId: itemId, qty: qty };
    if (src !== undefined && src.uid !== undefined) {
      drop.uid = src.uid;
      drop.mods = src.mods ?? {};
      if (src.ammo !== undefined) drop.ammo = src.ammo;
      if (src.rounds !== undefined) drop.rounds = src.rounds;
    }
    entities.add(id, ItemDrop, drop);
    entities.add(id, ParticleEmitter, {
      asset: "psDrop",
      color: InvTable.rarityColor(itemId),
    });
  },

  /**
   * Move a drop's payload into the player's bag, leaving any remainder on the ground; the drop
   * is removed (deferred) once emptied. Returns `{ itemId, qty, reason }`: `qty` taken, 0 with
   * `reason` "INV_FULL" for a refused bag.
   */
  pickup(entities, id, playerId) {
    const d = entities.require(id, ItemDrop);
    const inv = entities.require(playerId, Inventory);
    if (d.uid !== undefined) {
      const slot = {
        itemId: d.itemId,
        qty: 1,
        uid: d.uid,
        mods: d.mods ?? {},
      };
      if (d.ammo !== undefined) slot.ammo = d.ammo;
      if (d.rounds !== undefined) slot.rounds = d.rounds;
      if (Bag.addSlot(inv, slot) !== 0) {
        return { itemId: d.itemId, qty: 0, reason: "INV_FULL" };
      }
      entities.remove(id);
      return { itemId: d.itemId, qty: 1, reason: "" };
    }
    const left = Bag.add(inv, d.itemId, d.qty);
    const got = d.qty - left;
    if (left <= 0) entities.remove(id);
    else d.qty = left;
    return { itemId: d.itemId, qty: got, reason: got > 0 ? "" : "INV_FULL" };
  },
};

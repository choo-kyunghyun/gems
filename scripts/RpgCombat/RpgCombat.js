// Combat/loot plumbing for the RPG level — free functions taking the level (composition; GMRT has
// no usable class inheritance). Scene side effects come in as callbacks/options.
//
// Contract: the level owns `entities`, `playerId`, `_hpTrack` (id → last hp), `_invDirty`.
// The enemy set is derived LIVE by Faction (hostile to the player) and companions LIVE by the
// Follower component, so chunk streaming/squad transfer need no bookkeeping — allegiance and
// membership are component queries, not stored lists.
//
// Death is configured PER ENTITY by an opt-in `Mortal` (despawn/respawn/down/corpse), resolved in
// ONE place — resolveHealth + updateDowned. Damage systems only subtract hp; this is the sole
// authority that removes/respawns/incapacitates/leaves a body.
globalThis.RpgCombat = {
  // live enemy set: Health-bearing bodies hostile to the player (by Faction). Player allies
  // (followers/turrets, player faction) and neutral props (no Faction) are excluded.
  _enemies(entities, playerId) {
    const out = [];
    const ids = entities.query(Health);
    for (let i = 0; i < ids.length; i++) {
      if (FactionSystem.hostile(entities, playerId, ids[i])) out.push(ids[i]);
    }
    return out;
  },

  // floating combat numbers: diff each combatant's Health vs last tick, pop a rising number on any
  // change. Run after physics, before deaths flush, so the killing blow still pops.
  trackDamage(level, yOffset) {
    RpgCombat._diffHp(level, level.playerId, true, yOffset);
    const enemies = RpgCombat._enemies(level.entities, level.playerId);
    for (let i = 0; i < enemies.length; i++)
      RpgCombat._diffHp(level, enemies[i], false, yOffset);
    // companions carry Health too → ally "hurt" numbers (a downed one has Health detached, so
    // no-op). Live Follower query — squad members and residents alike are allies.
    const followers = level.entities.query(Follower);
    for (let i = 0; i < followers.length; i++)
      RpgCombat._diffHp(level, followers[i], true, yOffset);
    // mesh-bodied combatants (built turrets) — otherwise untracked (player faction, no
    // Follower); a double-diffed id is harmless (the first call settles _hpTrack).
    const meshBodies = level.entities.query(Health, Mesh);
    for (let i = 0; i < meshBodies.length; i++)
      RpgCombat._diffHp(level, meshBodies[i], true, yOffset);
  },

  _diffHp(level, id, isAlly, yOffset) {
    const entities = level.entities;
    if (!entities.isValid(id)) return;
    const hp = entities.get(Health, id);
    if (hp === undefined) return;
    const prev = level._hpTrack[id];
    if (prev !== undefined && hp.hp !== prev) {
      const pos = entities.get(Position, id);
      if (pos !== undefined) {
        const d = hp.hp - prev; // <0 = damage, >0 = heal
        if (d < 0) {
          FloatingText.push(pos.x, pos.y - yOffset, -d, {
            type: isAlly ? "hurt" : "damage",
          });
          // impact SFX; let the death pass own the killing blow (snd_explosion_small), so skip
          // enemy hp→0. A mesh body (turret/built structure) rings metal; allies read as
          // armored (geared squad), enemies as flesh (raiders/rats).
          const at = { x: pos.x, y: pos.y };
          if (entities.get(Mesh, id) !== undefined)
            Audio.playSfx({ sound: snd_hitsound_metal, position: at });
          else if (isAlly)
            Audio.playSfx({ sound: snd_hitsound_armor, position: at });
          else if (hp.hp > 0)
            Audio.playSfx({ sound: snd_hitsound_flesh, position: at });
        } else {
          FloatingText.push(pos.x, pos.y - yOffset, "+" + d, { type: "heal" });
        }
      }
    }
    level._hpTrack[id] = hp.hp;
  },

  // configurable death pass: an entity with `Mortal` at hp 0 reacts by its `Mortal.kind`. Before
  // flush, so a despawning entity is still readable for its loot. Handlers `h` (all optional):
  //   spill { yBase, ySpread } — loot scatter for "despawn"
  //   onKill(id)               — per-kill genre effects ("despawn" + "corpse", before the body
  //                              is transformed — the entity's components are still readable)
  //   onRespawn(id)            — reposition a "respawn" entity after refill
  //   downSpot(id) → {x,y}     — recovery spot for a "down" entity
  //   onDown(id)               — fired when an entity enters Down
  // Only Mortal entities react (a built turret → BuildMode.reapDestroyed is left alone).
  resolveHealth(level, h) {
    h = h ?? {};
    const entities = level.entities;
    // snapshot ids this tick (remove/detach are deferred / array is materialized)
    const ids = entities.query(Health, Mortal);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const hp = entities.get(Health, id);
      if (hp === undefined || hp.hp > 0) continue;
      const m = entities.get(Mortal, id);
      if (m.kind === "despawn") {
        RpgCombat.spillLoot(level, id, h.spill);
        if (h.onKill !== undefined) h.onKill(id);
        entities.remove(id);
      } else if (m.kind === "corpse") {
        if (h.onKill !== undefined) h.onKill(id); // before the transform strips components
        RpgCombat._toCorpse(level, id);
      } else if (m.kind === "respawn") {
        const st = entities.get(Stats, id);
        hp.hp = st !== undefined ? st.maxHp : (m.reviveHp ?? 10);
        if (h.onRespawn !== undefined) h.onRespawn(id);
        level._hpTrack[id] = hp.hp; // don't pop a "+heal" for the refill
      } else if (m.kind === "down") {
        RpgCombat._goDown(level, id, m, h);
      }
    }
  },

  // incapacitate a "down" entity: drop Health (so nearestHostile stops targeting + this pass skips
  // it), stop + dim it, start the recovery timer.
  // Deliberately touches neither Squad nor Follower: a downed companion stays a squad member with
  // its carry bonus intact (that rides Follower.state, which a down->recover cycle never changes),
  // so being knocked out can't silently shrink the player's bag.
  _goDown(level, id, m, h) {
    const entities = level.entities;
    entities.detach(id, Health);
    const vel = entities.get(Velocity, id);
    if (vel !== undefined) {
      vel.x = 0;
      vel.y = 0;
    }
    const vis = entities.get(Visual, id);
    if (vis !== undefined) vis.alpha = 0.4; // dimmed = downed
    entities.add(id, Downed, { timer: m.recoverSecs ?? 6 });
    delete level._hpTrack[id]; // no Health now — clear the stale diff baseline
    if (h.onDown !== undefined) h.onDown(id);
  },

  // down-timer tick: at <= 0 revive — re-add Health (reviveHp), undim, teleport to h.downSpot, drop Downed
  updateDowned(level, h) {
    h = h ?? {};
    const entities = level.entities;
    const ids = entities.query(Downed);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const d = entities.get(Downed, id);
      d.timer -= World.sim.tickDuration;
      if (d.timer > 0) continue;
      const m = entities.get(Mortal, id);
      const reviveHp = m !== undefined ? (m.reviveHp ?? 1) : 1;
      entities.add(id, Health, { hp: reviveHp });
      const vis = entities.get(Visual, id);
      if (vis !== undefined) vis.alpha = 1;
      const spot = h.downSpot !== undefined ? h.downSpot(id) : undefined;
      if (spot !== undefined) {
        const pos = entities.get(Position, id);
        const vel = entities.get(Velocity, id);
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
      level._hpTrack[id] = reviveHp; // baseline so recovery doesn't pop a "+heal"
      if (h.onRecover !== undefined) h.onRecover(id);
    }
  },

  // transform a "corpse"-kind entity IN PLACE into a lootable body: strip the combatant —
  // Health/Stats/AI/Faction (targeting, the death scan and CombatAI aggro all key on those) —
  // make it walk-over, freeze + flatten the visual, and tag it Interaction { kind: "corpse" }
  // so the Interactable engine opens StorageUI on its Inventory (see RpgInteractions). Keeping
  // the SAME entity means a chunk demote/unload snapshots the corpse like any resident entity.
  // Species markers (Raider/Rat — radar blips) are the level's to drop in onKill, not ours.
  _toCorpse(level, id) {
    const entities = level.entities;
    entities.detach(id, Health);
    entities.detach(id, Mortal); // dead once — this pass is done with it
    entities.detach(id, Stats);
    entities.detach(id, Brain); // CombatAI off
    entities.detach(id, State);
    entities.detach(id, Velocity); // no integrator touches it again
    entities.detach(id, PrevPosition); // renderers lerp Prev→Pos when present — a stale one offsets the draw
    entities.detach(id, Faction);
    entities.detach(id, Animator); // stop the state machine writing subimg
    const col = entities.get(Collision, id);
    if (col !== undefined) col.solid = false; // walk-over; BBox stays for cursor pick/highlight
    const vis = entities.get(Visual, id);
    if (vis !== undefined) {
      vis.alpha = 0.4; // dimmed = dead (the Downed convention; Appearance layers share alpha)
      vis.speed = 0; // freeze self-animating sprites (rat scuttle)
      vis.subimg = 0; // neutral contact pose
      vis.yscale = Math.abs(vis.yscale) * 0.45; // crumpled flat (|scale| carries baked size)
    }
    entities.add(id, Interaction, { kind: "corpse" });
    delete level._hpTrack[id]; // no Health now — clear the stale diff baseline
  },

  // remove looted-empty corpses (deferred remove; the tick's flush commits). Emptying one with
  // its window open is safe: Interactable range-closes when the entity's Position vanishes and
  // StorageUI.refresh guards a missing Inventory. A lootless kill reaps the same tick it
  // corpses — behaviorally the old despawn.
  reapCorpses(level) {
    const entities = level.entities;
    const ids = entities.query(Interaction);
    for (let i = 0; i < ids.length; i++) {
      const it = entities.get(Interaction, ids[i]);
      if (it === undefined || it.kind !== "corpse") continue;
      const inv = entities.get(Inventory, ids[i]);
      if (inv === undefined || inv.slots.length === 0) entities.remove(ids[i]);
    }
  },

  // scatter an enemy's Inventory as ground-drop sensors; `opts` { yBase, ySpread } tunes placement
  spillLoot(level, enemyId, opts) {
    const entities = level.entities;
    const inv = entities.get(Inventory, enemyId);
    const pos = entities.get(Position, enemyId);
    if (inv === undefined || pos === undefined) return;
    const yBase =
      opts !== undefined && opts.yBase !== undefined ? opts.yBase : 0;
    const ySpread =
      opts !== undefined && opts.ySpread !== undefined ? opts.ySpread : 24;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const ox = (i % 2 === 0 ? -1 : 1) * 32;
      const oy = (i < 2 ? -1 : 1) * ySpread;
      RpgCombat.spawnDrop(
        level,
        s.itemId,
        s.qty,
        pos.x + ox,
        pos.y + yBase + oy,
        s, // pass the source slot so an instance's uid/mods ride the drop
      );
    }
  },

  // `src` (optional) source slot — an instance (has uid) records uid+mods so pickup re-inserts the same one
  spawnDrop(level, itemId, qty, x, y, src) {
    const entities = level.entities;
    const id = entities.create();
    entities.add(id, Position, { x: x, y: y, z: 0 });
    // match the ×2-drawn 16px icon sprite RpgWorldOverlay draws so the trigger box lines up with the drop
    entities.add(id, BBox, { x: -16, y: -16, width: 32, height: 32 });
    entities.add(id, Collision, {
      solid: false,
      kinematic: false,
      mask: null,
      hits: [],
    });
    const drop = { itemId: itemId, qty: qty };
    if (src !== undefined && src.uid !== undefined) {
      drop.uid = src.uid;
      drop.mods = src.mods ?? [];
    }
    entities.add(id, ItemDrop, drop);
  },

  // pick up overlapping ItemDrop sensors (in Collision.hits) into the bag; onCollect for genre effects
  collectDrops(level, onCollect) {
    const entities = level.entities;
    const hits = entities.get(Collision, level.playerId).hits;
    const inv = entities.get(Inventory, level.playerId);
    for (let i = 0; i < hits.length; i++) {
      const id = hits[i];
      const d = entities.get(ItemDrop, id);
      if (d === undefined) continue;
      // An instance drop re-inserts whole (uid + mods preserved); a fungible drop adds by qty.
      if (d.uid !== undefined) {
        const ok = InventorySystem.addSlot(inv, {
          itemId: d.itemId,
          qty: 1,
          uid: d.uid,
          mods: d.mods ?? [],
        });
        if (ok) {
          level._invDirty = true;
          if (onCollect !== undefined) onCollect(d.itemId, 1);
          entities.remove(id);
        }
        continue; // bag full → leave the instance on the ground
      }
      const left = InventorySystem.add(inv, d.itemId, d.qty);
      const got = d.qty - left;
      if (got > 0) {
        level._invDirty = true; // bag changed — refresh the window if open
        if (onCollect !== undefined) onCollect(d.itemId, got);
      }
      if (left <= 0) entities.remove(id);
      else d.qty = left; // bag full — leave the remainder on the ground
    }
  },
};

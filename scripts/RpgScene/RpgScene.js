// Combat/loot plumbing for the RPG scene — free functions taking the scene (composition; GMRT has
// no usable class inheritance). Scene side effects come in as callbacks/options.
//
// Contract: the scene owns `world`, `playerId`, `_hpTrack` (id → last hp), `_invDirty`.
// The enemy set is derived LIVE by Faction (hostile to the player) and companions LIVE by the
// Follower component, so chunk streaming/squad transfer need no bookkeeping — allegiance and
// membership are component queries, not stored lists.
//
// Death is configured PER ENTITY by an opt-in `Mortal` (despawn/respawn/down/corpse), resolved in
// ONE place — resolveHealth + updateDowned. Damage systems only subtract hp; this is the sole
// authority that removes/respawns/incapacitates/leaves a body.
globalThis.RpgScene = {
  // live enemy set: Health-bearing bodies hostile to the player (by Faction). Player allies
  // (followers/turrets, player faction) and neutral props (no Faction) are excluded.
  _enemies(world, playerId) {
    const out = [];
    const ids = world.query(Health);
    for (let i = 0; i < ids.length; i++) {
      if (FactionSystem.hostile(world, playerId, ids[i])) out.push(ids[i]);
    }
    return out;
  },

  // floating combat numbers: diff each combatant's Health vs last tick, pop a rising number on any
  // change. Run after physics, before deaths flush, so the killing blow still pops.
  trackDamage(scene, yOffset) {
    RpgScene._diffHp(scene, scene.playerId, true, yOffset);
    const enemies = RpgScene._enemies(scene.world, scene.playerId);
    for (let i = 0; i < enemies.length; i++)
      RpgScene._diffHp(scene, enemies[i], false, yOffset);
    // companions carry Health too → ally "hurt" numbers (a downed one has Health detached, so
    // no-op). Live Follower query — squad members and residents alike are allies.
    const followers = scene.world.query(Follower);
    for (let i = 0; i < followers.length; i++)
      RpgScene._diffHp(scene, followers[i], true, yOffset);
    // mesh-bodied combatants (built turrets) — otherwise untracked (player faction, no
    // Follower); a double-diffed id is harmless (the first call settles _hpTrack).
    const meshBodies = scene.world.query(Health, Mesh);
    for (let i = 0; i < meshBodies.length; i++)
      RpgScene._diffHp(scene, meshBodies[i], true, yOffset);
  },

  _diffHp(scene, id, isAlly, yOffset) {
    const world = scene.world;
    if (!world.isValid(id)) return;
    const hp = world.get(Health, id);
    if (hp === undefined) return;
    const prev = scene._hpTrack[id];
    if (prev !== undefined && hp.hp !== prev) {
      const pos = world.get(Position, id);
      if (pos !== undefined) {
        const d = hp.hp - prev; // <0 = damage, >0 = heal
        if (d < 0) {
          FloatingText.push(pos.x, pos.y - yOffset, -d, {
            type: isAlly ? "hurt" : "damage",
          });
          // impact SFX; let the death pass own the killing blow (snd_explosion_small), so skip
          // enemy hp→0. A mesh body (turret/built structure) rings metal; allies read as
          // armored (geared squad), enemies as flesh (raiders/rats).
          if (world.get(Mesh, id) !== undefined)
            Audio.playAt("snd_hitsound_metal", pos.x, pos.y);
          else if (isAlly) Audio.playAt("snd_hitsound_armor", pos.x, pos.y);
          else if (hp.hp > 0) Audio.playAt("snd_hitsound_flesh", pos.x, pos.y);
        } else {
          FloatingText.push(pos.x, pos.y - yOffset, "+" + d, { type: "heal" });
        }
      }
    }
    scene._hpTrack[id] = hp.hp;
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
  resolveHealth(scene, h) {
    h = h ?? {};
    const world = scene.world;
    // snapshot ids this tick (remove/detach are deferred / array is materialized)
    const ids = world.query(Health, Mortal);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const hp = world.get(Health, id);
      if (hp === undefined || hp.hp > 0) continue;
      const m = world.get(Mortal, id);
      if (m.kind === "despawn") {
        RpgScene.spillLoot(scene, id, h.spill);
        if (h.onKill !== undefined) h.onKill(id);
        world.remove(id);
      } else if (m.kind === "corpse") {
        if (h.onKill !== undefined) h.onKill(id); // before the transform strips components
        RpgScene._toCorpse(scene, id);
      } else if (m.kind === "respawn") {
        const st = world.get(Stats, id);
        hp.hp = st !== undefined ? st.maxHp : (m.reviveHp ?? 10);
        if (h.onRespawn !== undefined) h.onRespawn(id);
        scene._hpTrack[id] = hp.hp; // don't pop a "+heal" for the refill
      } else if (m.kind === "down") {
        RpgScene._goDown(scene, id, m, h);
      }
    }
  },

  // incapacitate a "down" entity: drop Health (so nearestHostile stops targeting + this pass skips
  // it), stop + dim it, start the recovery timer.
  _goDown(scene, id, m, h) {
    const world = scene.world;
    world.detach(id, Health);
    const vel = world.get(Velocity, id);
    if (vel !== undefined) {
      vel.x = 0;
      vel.y = 0;
    }
    const vis = world.get(Visual, id);
    if (vis !== undefined) vis.alpha = 0.4; // dimmed = downed
    world.add(id, Downed, { timer: m.recoverSecs ?? 6 });
    delete scene._hpTrack[id]; // no Health now — clear the stale diff baseline
    if (h.onDown !== undefined) h.onDown(id);
  },

  // down-timer tick: at <= 0 revive — re-add Health (reviveHp), undim, teleport to h.downSpot, drop Downed
  updateDowned(scene, h) {
    h = h ?? {};
    const world = scene.world;
    const ids = world.query(Downed);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const d = world.get(Downed, id);
      d.timer -= World.sim.tickDuration;
      if (d.timer > 0) continue;
      const m = world.get(Mortal, id);
      const reviveHp = m !== undefined ? (m.reviveHp ?? 1) : 1;
      world.add(id, Health, { hp: reviveHp });
      const vis = world.get(Visual, id);
      if (vis !== undefined) vis.alpha = 1;
      const spot = h.downSpot !== undefined ? h.downSpot(id) : undefined;
      if (spot !== undefined) {
        const pos = world.get(Position, id);
        const vel = world.get(Velocity, id);
        if (pos !== undefined) {
          pos.x = spot.x;
          pos.y = spot.y;
        }
        if (vel !== undefined) {
          vel.x = 0;
          vel.y = 0;
        }
      }
      world.detach(id, Downed);
      scene._hpTrack[id] = reviveHp; // baseline so recovery doesn't pop a "+heal"
      if (h.onRecover !== undefined) h.onRecover(id);
    }
  },

  // transform a "corpse"-kind entity IN PLACE into a lootable body: strip the combatant —
  // Health/Stats/AI/Faction (targeting, the death scan and CombatAI aggro all key on those) —
  // make it walk-over, freeze + flatten the visual, and tag it Interaction { kind: "corpse" }
  // so the Interactable engine opens StorageUI on its Inventory (see RpgInteractions). Keeping
  // the SAME entity means a chunk demote/unload snapshots the corpse like any resident entity.
  // Species markers (Raider/Rat — radar blips) are the scene's to drop in onKill, not ours.
  _toCorpse(scene, id) {
    const world = scene.world;
    world.detach(id, Health);
    world.detach(id, Mortal); // dead once — this pass is done with it
    world.detach(id, Stats);
    world.detach(id, Brain); // CombatAI off
    world.detach(id, State);
    world.detach(id, Velocity); // no integrator touches it again
    world.detach(id, PrevPosition); // renderers lerp Prev→Pos when present — a stale one offsets the draw
    world.detach(id, Faction);
    world.detach(id, Animator); // stop the state machine writing subimg
    const col = world.get(Collision, id);
    if (col !== undefined) col.solid = false; // walk-over; BBox stays for cursor pick/highlight
    const vis = world.get(Visual, id);
    if (vis !== undefined) {
      vis.alpha = 0.4; // dimmed = dead (the Downed convention; Appearance layers share alpha)
      vis.speed = 0; // freeze self-animating sprites (rat scuttle)
      vis.subimg = 0; // neutral contact pose
      vis.yscale = Math.abs(vis.yscale) * 0.45; // crumpled flat (|scale| carries baked size)
    }
    world.add(id, Interaction, { kind: "corpse" });
    delete scene._hpTrack[id]; // no Health now — clear the stale diff baseline
  },

  // remove looted-empty corpses (deferred remove; the tick's flush commits). Emptying one with
  // its window open is safe: Interactable range-closes when the entity's Position vanishes and
  // StorageUI.refresh guards a missing Inventory. A lootless kill reaps the same tick it
  // corpses — behaviorally the old despawn.
  reapCorpses(scene) {
    const world = scene.world;
    const ids = world.query(Interaction);
    for (let i = 0; i < ids.length; i++) {
      const it = world.get(Interaction, ids[i]);
      if (it === undefined || it.kind !== "corpse") continue;
      const inv = world.get(Inventory, ids[i]);
      if (inv === undefined || inv.slots.length === 0) world.remove(ids[i]);
    }
  },

  // scatter an enemy's Inventory as ground-drop sensors; `opts` { yBase, ySpread } tunes placement
  spillLoot(scene, enemyId, opts) {
    const world = scene.world;
    const inv = world.get(Inventory, enemyId);
    const pos = world.get(Position, enemyId);
    if (inv === undefined || pos === undefined) return;
    const yBase =
      opts !== undefined && opts.yBase !== undefined ? opts.yBase : 0;
    const ySpread =
      opts !== undefined && opts.ySpread !== undefined ? opts.ySpread : 24;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const ox = (i % 2 === 0 ? -1 : 1) * 32;
      const oy = (i < 2 ? -1 : 1) * ySpread;
      RpgScene.spawnDrop(
        scene,
        s.itemId,
        s.qty,
        pos.x + ox,
        pos.y + yBase + oy,
        s, // pass the source slot so an instance's uid/mods ride the drop
      );
    }
  },

  // `src` (optional) source slot — an instance (has uid) records uid+mods so pickup re-inserts the same one
  spawnDrop(scene, itemId, qty, x, y, src) {
    const world = scene.world;
    const id = world.create();
    world.add(id, Position, { x: x, y: y, z: 0 });
    // match the ×2-drawn 16px icon sprite RpgWorldOverlay draws so the trigger box lines up with the drop
    world.add(id, BBox, { x: -16, y: -16, width: 32, height: 32 });
    world.add(id, Collision, {
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
    world.add(id, ItemDrop, drop);
  },

  // pick up overlapping ItemDrop sensors (in Collision.hits) into the bag; onCollect for genre effects
  collectDrops(scene, onCollect) {
    const world = scene.world;
    const hits = world.get(Collision, scene.playerId).hits;
    const inv = world.get(Inventory, scene.playerId);
    for (let i = 0; i < hits.length; i++) {
      const id = hits[i];
      const d = world.get(ItemDrop, id);
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
          scene._invDirty = true;
          if (onCollect !== undefined) onCollect(d.itemId, 1);
          world.remove(id);
        }
        continue; // bag full → leave the instance on the ground
      }
      const left = InventorySystem.add(inv, d.itemId, d.qty);
      const got = d.qty - left;
      if (got > 0) {
        scene._invDirty = true; // bag changed — refresh the window if open
        if (onCollect !== undefined) onCollect(d.itemId, got);
      }
      if (left <= 0) world.remove(id);
      else d.qty = left; // bag full — leave the remainder on the ground
    }
  },
};

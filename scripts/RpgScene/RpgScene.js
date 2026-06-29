// Combat/loot plumbing for the RPG scene — free functions taking the scene (composition; GMRT has
// no usable class inheritance). Scene side effects come in as callbacks/options.
//
// Contract: the scene owns `world`, `ctrl` (with `.id`), `followers`, `_hpTrack` (id → last hp),
// `_invDirty`. The enemy set is derived LIVE by Tag "enemy" so chunk streaming needs no bookkeeping.
//
// Death is configured PER ENTITY by an opt-in `Mortal` (despawn/respawn/down), resolved in ONE
// place — resolveHealth + updateDowned. Damage systems only subtract hp; this is the sole authority
// that removes/respawns/incapacitates.
globalThis.RpgScene = {
  // live enemy set: Health + Tag "enemy". (Set.has is GMRT-safe; only Set ITERATION is banned.)
  _enemies(world) {
    const out = [];
    const ids = world.query(Health, Tag);
    for (let i = 0; i < ids.length; i++) {
      const tag = world.get(Tag, ids[i]);
      if (tag.tags.has("enemy")) out.push(ids[i]);
    }
    return out;
  },

  // floating combat numbers: diff each combatant's Health vs last tick, pop a rising number on any
  // change. Run after physics, before deaths flush, so the killing blow still pops.
  trackDamage(scene, yOffset) {
    RpgScene._diffHp(scene, scene.ctrl.id, true, yOffset);
    const enemies = RpgScene._enemies(scene.world);
    for (let i = 0; i < enemies.length; i++)
      RpgScene._diffHp(scene, enemies[i], false, yOffset);
    // companions carry Health too → ally "hurt" numbers (a downed one has Health detached, so no-op)
    const followers = scene.followers;
    if (followers !== undefined)
      for (let i = 0; i < followers.length; i++)
        RpgScene._diffHp(scene, followers[i], true, yOffset);
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
          // impact SFX; let the death pass own the killing blow (snd_explosion), so skip enemy hp→0
          if (isAlly) Audio.playAt("snd_hurt", pos.x, pos.y);
          else if (hp.hp > 0) Audio.playAt("snd_hit", pos.x, pos.y);
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
  //   onDespawn(id)            — per-kill genre effects
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
        if (h.onDespawn !== undefined) h.onDespawn(id);
        world.remove(id);
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
      d.timer -= world.tickDuration;
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

  // scatter an enemy's Inventory as ground-drop sensors; `opts` { yBase, ySpread } tunes placement
  spillLoot(scene, enemyId, opts) {
    const world = scene.world;
    const inv = world.get(Inventory, enemyId);
    const pos = world.get(Position, enemyId);
    if (inv === undefined || pos === undefined) return;
    const yBase =
      opts !== undefined && opts.yBase !== undefined ? opts.yBase : 0;
    const ySpread =
      opts !== undefined && opts.ySpread !== undefined ? opts.ySpread : 12;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const ox = (i % 2 === 0 ? -1 : 1) * 16;
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
    // match the 16px icon sprite RpgWorldOverlay draws so the trigger box lines up with the drop
    world.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 });
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
    const hits = world.get(Collision, scene.ctrl.id).hits;
    const inv = world.get(Inventory, scene.ctrl.id);
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

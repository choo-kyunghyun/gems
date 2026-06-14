// Shared combat/loot plumbing for the RPG genre scenes (platformer + top-down). These
// were duplicated, near-identical methods on both scene classes; centralized here as
// free functions taking the scene (composition — GMRT has no usable class inheritance).
// Genre-specific side effects are passed as small callbacks/options.
//
// Contract: the scene owns `world`, `ctrl` (with `.id`), `_hpTrack` (id → last-seen hp),
// and `_invDirty` (bag-changed flag). The enemy set is derived LIVE from the world by
// Tag "enemy" (not a stored scene.enemies list) so chunk streaming — which adds/removes
// enemies from the world as chunks load/unload — needs no list bookkeeping.
globalThis.RpgScene = {
  // Live enemy set: entities carrying Health + Tag "enemy". (Set.has is GMRT-safe; only
  // Set ITERATION is banned.) The player has Health but no "enemy" tag, so it's excluded.
  _enemies(world) {
    const out = [];
    const ids = world.query(Health, Tag);
    for (let i = 0; i < ids.length; i++) {
      const tag = world.get(Tag, ids[i]);
      if (tag.tags.has("enemy")) out.push(ids[i]);
    }
    return out;
  },

  // Floating combat numbers: diff each combatant's Health vs last tick, pop a rising
  // number on any change (damage falls, heals rise). `yOffset` lifts the number above the
  // entity (genre sprite height: ~28 platformer, ~14 top-down). Run after physics, before
  // deaths are flushed, so the killing blow still pops.
  trackDamage(scene, yOffset) {
    RpgScene._diffHp(scene, scene.ctrl.id, true, yOffset);
    const enemies = RpgScene._enemies(scene.world);
    for (let i = 0; i < enemies.length; i++)
      RpgScene._diffHp(scene, enemies[i], false, yOffset);
  },

  _diffHp(scene, id, isPlayer, yOffset) {
    const world = scene.world;
    if (!world.isValid(id)) return;
    const hp = world.get(Health, id);
    if (hp === undefined) return;
    const prev = scene._hpTrack[id];
    if (prev !== undefined && hp.hp !== prev) {
      const pos = world.get(Position, id);
      if (pos !== undefined) {
        const d = hp.hp - prev; // <0 = damage, >0 = heal
        if (d < 0)
          FloatingText.push(pos.x, pos.y - yOffset, -d, {
            type: isPlayer ? "hurt" : "damage",
          });
        else
          FloatingText.push(pos.x, pos.y - yOffset, "+" + d, { type: "heal" });
      }
    }
    scene._hpTrack[id] = hp.hp;
  },

  // Remove dead enemies (hp ≤ 0), spilling their Inventory as ground drops first. `opts`:
  // { onKill?(id), spill?({ yBase, ySpread }) } — onKill fires per kill for genre side
  // effects (quest/profile counters + logging). Runs before flush so the entity is still
  // readable.
  resolveDeaths(scene, opts) {
    opts = opts ?? {};
    const world = scene.world;
    // Live enemy snapshot for this tick; a removed enemy simply won't appear next tick
    // (no list to splice). Iterate forward — world.remove is deferred to flush, so each
    // entity stays readable here.
    const enemies = RpgScene._enemies(world);
    for (let i = 0; i < enemies.length; i++) {
      const id = enemies[i];
      const hp = world.get(Health, id);
      if (hp !== undefined && hp.hp <= 0) {
        RpgScene.spillLoot(scene, id, opts.spill);
        if (opts.onKill !== undefined) opts.onKill(id);
        world.remove(id);
      }
    }
  },

  // Scatter an enemy's Inventory as ground-drop sensors around it. `opts`: { yBase,
  // ySpread } tunes the vertical placement per genre (cosmetic).
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
      );
    }
  },

  spawnDrop(scene, itemId, qty, x, y) {
    const world = scene.world;
    const id = world.create();
    world.add(id, Position, { x: x, y: y, z: 0 });
    world.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 });
    world.add(id, Collision, {
      solid: false,
      kinematic: false,
      mask: null,
      hits: [],
    });
    world.add(id, ItemDrop, { itemId: itemId, qty: qty });
  },

  // Pick up overlapping ItemDrop sensors (filled into the player's Collision.hits by
  // TriggerSystem) into the bag. `onCollect?(itemId, got)` fires for genre side effects
  // (quest/profile counters + logging). Sets scene._invDirty when the bag changes.
  collectDrops(scene, onCollect) {
    const world = scene.world;
    const hits = world.get(Collision, scene.ctrl.id).hits;
    const inv = world.get(Inventory, scene.ctrl.id);
    for (let i = 0; i < hits.length; i++) {
      const id = hits[i];
      const d = world.get(ItemDrop, id);
      if (d === undefined) continue;
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

  // hp ≤ 0 → refill to maxHp and respawn. `onRespawn()` does the genre-specific reset
  // (platformer controller respawn vs a manual pos/vel reset). Suppresses a "+heal" pop
  // for the refill.
  checkPlayerDeath(scene, onRespawn) {
    const world = scene.world;
    const hp = world.get(Health, scene.ctrl.id);
    if (hp === undefined || hp.hp > 0) return;
    const st = world.get(Stats, scene.ctrl.id);
    hp.hp = st !== undefined ? st.maxHp : 10;
    if (onRespawn !== undefined) onRespawn();
    scene._hpTrack[scene.ctrl.id] = hp.hp; // don't pop a "+heal" for the respawn refill
    Log.info("player died — respawned at spawn");
  },
};

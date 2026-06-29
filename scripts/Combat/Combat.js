// Single damage applier for all paths (melee, hitscan, projectile). Kit stays stat-agnostic via
// the injected `mitigate` hook; the RPG wires its defense formula in sceneRpg.create. Only
// subtracts hp — the reaction at <=0 hp is decided centrally by the Mortal death pass.
globalThis.Combat = {
  // injected defense formula — default identity; RPG overrides with max(1, amount-max(0,defense-pen))
  mitigate(world, targetId, amount, penetration = 0) {
    return amount;
  },

  // apply damage through the mitigate hook; 0 if target has no Health (wall/prop)
  applyDamage(world, targetId, amount, penetration = 0) {
    const hp = world.get(Health, targetId);
    if (hp === undefined) return 0;
    const dealt = Combat.mitigate(world, targetId, amount, penetration);
    hp.hp -= dealt;
    return dealt;
  },

  // instant hitscan along (x0,y0)→(x1,y1). walks hits in order; ally/wall blocks, hostile takes
  // damage. `pierce` = max targets hit (default 1). returns { x, y, hits } (endpoint + struck ids).
  //   opts: { owner, damage, penetration? (default 0), pierce? (default 1) }
  hitscan(world, x0, y0, x1, y1, opts) {
    const owner = opts.owner;
    const pen = opts.penetration ?? 0;
    let remaining = opts.pierce ?? 1;
    const all = Raycast.castAll(world, x0, y0, x1, y1, { ignore: owner });
    const hits = [];
    let endX = x1;
    let endY = y1;
    for (let i = 0; i < all.length; i++) {
      const h = all[i];
      const hp = world.get(Health, h.id);
      if (hp === undefined || FactionSystem.allied(world, owner, h.id)) {
        // wall/prop or ally blocks — stop here, no damage
        endX = h.x;
        endY = h.y;
        break;
      }
      Combat.applyDamage(world, h.id, opts.damage, pen);
      hits.push(h.id);
      remaining--;
      if (remaining <= 0) {
        endX = h.x;
        endY = h.y;
        break;
      }
    }
    return { x: endX, y: endY, hits };
  },
};

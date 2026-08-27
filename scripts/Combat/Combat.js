// Single damage applier for all paths (melee, hitscan, projectile, blast) — stays stat-agnostic via
// the injected `mitigate` hook. Only subtracts hp; the reaction at <=0 hp is the Mortal death pass.
/**
 * The colony wires its defense formula in sceneColony.create, so the applier itself never reads a stat
 * sheet — hitscan needs only Health + Faction.
 */
globalThis.Combat = {
  // injected defense formula — default identity; colony overrides with max(1, amount-max(0,defense-pen))
  mitigate(entities, targetId, amount, penetration = 0) {
    return amount;
  },

  // apply damage through the mitigate hook; 0 if target has no Health (wall/prop)
  applyDamage(entities, targetId, amount, penetration = 0) {
    const hp = entities.get(targetId, Health);
    if (hp === undefined) return 0;
    const dealt = Combat.mitigate(entities, targetId, amount, penetration);
    hp.hp -= dealt;
    return dealt;
  },

  /**
   * instant hitscan along (x0,y0)→(x1,y1). walks hits in order; ally/wall blocks, hostile takes
   * damage. `pierce` = max targets hit (default 1). returns { x, y, hits } (endpoint + struck ids).
   *   opts: { owner, damage, penetration? (default 0), pierce? (default 1) }
   */
  hitscan(entities, x0, y0, x1, y1, opts) {
    const owner = opts.owner;
    const pen = opts.penetration ?? 0;
    let remaining = opts.pierce ?? 1;
    const all = Raycast.castAll(entities, x0, y0, x1, y1, { ignore: owner });
    const hits = [];
    let endX = x1;
    let endY = y1;
    for (let i = 0; i < all.length; i++) {
      const h = all[i];
      const hp = entities.get(h.id, Health);
      if (hp === undefined || FactionSystem.allied(entities, owner, h.id)) {
        // wall/prop or ally blocks — stop here, no damage
        endX = h.x;
        endY = h.y;
        break;
      }
      Combat.applyDamage(entities, h.id, opts.damage, pen);
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

  /**
   * radial blast at (x,y): every Health within `radius` takes damage — full at the centre, halving
   * toward the edge — unless allied with the owner (like a swing: no friendly fire) or shadowed by
   * a structure (isStructure) between the centre and its Position; bodies never shadow each
   * other. returns the struck ids.
   *   opts: { owner, damage, penetration? (default 0) }
   */
  explode(entities, x, y, radius, opts) {
    const owner = opts.owner;
    const pen = opts.penetration ?? 0;
    const hits = [];
    const ids = Query.inRadius(entities, x, y, radius, { has: Health });
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === owner) continue;
      if (FactionSystem.allied(entities, owner, id)) continue;
      const pos = entities.get(id, Position);
      if (Combat._shadowed(entities, x, y, pos.x, pos.y, owner)) continue;
      const d = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
      const amount = Math.max(
        1,
        Math.round(opts.damage * (1 - 0.5 * (d / radius))),
      );
      Combat.applyDamage(entities, id, amount, pen);
      hits.push(id);
    }
    return hits;
  },

  /**
   * a STRUCTURE — what a lob lands against and what shadows a blast: a kinematic collider that is
   * not a standing person (no Skeleton) — walls, furniture, the map border, a built turret. Bodies
   * (the squad, raiders, an NPC) are flown over and looked through.
   */
  isStructure(entities, id) {
    const col = entities.get(id, Collision);
    if (col === undefined || col.kinematic !== true) return false;
    return !entities.has(id, Skeleton);
  },

  /** true when a structure lies on the segment; bodies are looked through */
  _shadowed(entities, x0, y0, x1, y1, owner) {
    const all = Raycast.castAll(entities, x0, y0, x1, y1, { ignore: owner });
    for (let i = 0; i < all.length; i++) {
      if (Combat.isStructure(entities, all[i].id)) return true;
    }
    return false;
  },
};

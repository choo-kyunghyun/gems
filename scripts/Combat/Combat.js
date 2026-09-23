// Single damage applier for all paths (melee, hitscan, projectile, blast) — stays stat-agnostic via
// the injected `mitigate` hook. Only subtracts hp; the reaction at <=0 hp is the Mortal death pass.
/**
 * The colony wires its defense formula in sceneColony.create, so the applier itself never reads a stat
 * sheet — hitscan needs only Health + Faction. A cast (hitscan, explode) takes the LEVEL; the
 * segment cast (Query.castAll) and the appliers take its store.
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
  hitscan(level, x0, y0, x1, y1, opts) {
    const entities = level.entities;
    const owner = opts.owner;
    const pen = opts.penetration ?? 0;
    let remaining = opts.pierce ?? 1;
    const all = Query.castAll(entities, x0, y0, x1, y1, { ignore: owner });
    const hits = [];
    let endX = x1;
    let endY = y1;
    for (let i = 0; i < all.length; i++) {
      const h = all[i];
      const hp = entities.get(h.id, Health);
      if (hp === undefined || Diplomacy.allied(entities, owner, h.id)) {
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
  explode(level, x, y, radius, opts) {
    const entities = level.entities;
    const owner = opts.owner;
    const pen = opts.penetration ?? 0;
    const hits = [];
    const ids = Query.maskCircle(entities, x, y, radius, { has: Health }); // a body's box in the blast, not its centre
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === owner) continue;
      if (Diplomacy.allied(entities, owner, id)) continue;
      const pos = entities.get(id, Position);
      if (Combat._shadowed(level, x, y, pos.x, pos.y, owner)) continue;
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
  _shadowed(level, x0, y0, x1, y1, owner) {
    const all = Query.castAll(level.entities, x0, y0, x1, y1, { ignore: owner });
    for (let i = 0; i < all.length; i++) {
      if (Combat.isStructure(level.entities, all[i].id)) return true;
    }
    return false;
  },

  /**
   * Lob a fused charge from `ownerId`'s Position toward (tx, ty): a lobbed Projectile whose range
   * is the distance, so it lands ON the target point (or against the first collider on the way),
   * carrying the Fuse FuseSystem counts down. Returns the charge's id.
   *   spec: { speed (px/s), secs, radius, damage, penetration? }
   */
  lob(entities, ownerId, tx, ty, spec) {
    const pos = entities.get(ownerId, Position);
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // a throw at the thrower's own feet has no direction: the charge just sits there
    const nx = dist > 0 ? dx / dist : 0;
    const ny = dist > 0 ? dy / dist : 0;
    const id = entities.create();
    entities.add(id, Position, { x: pos.x, y: pos.y, z: 0 });
    entities.add(id, Velocity, {
      x: nx * spec.speed,
      y: ny * spec.speed,
      z: 0,
    });
    entities.add(id, Projectile, {
      damage: 0,
      owner: ownerId,
      lob: true,
      range: dist,
    });
    entities.add(id, Fuse, {
      secs: spec.secs,
      radius: spec.radius,
      damage: spec.damage,
      owner: ownerId,
      penetration: spec.penetration ?? 0,
    });
    return id;
  },
};

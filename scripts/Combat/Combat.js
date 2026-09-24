/**
 * The one stat-agnostic damage applier for every damage path. A game injects its defense formula
 * as `mitigate`, so the applier never reads a stat sheet. A cast (hitscan, explode) takes the
 * level; the appliers take its store.
 */
globalThis.Combat = {
  // injected defense formula; identity until a game overrides it
  mitigate(entities, targetId, amount, penetration = 0) {
    return amount;
  },

  // 0 when the target has no Health
  applyDamage(entities, targetId, amount, penetration = 0) {
    const hp = entities.get(targetId, Health);
    if (hp === undefined) return 0;
    const dealt = Combat.mitigate(entities, targetId, amount, penetration);
    hp.hp -= dealt;
    return dealt;
  },

  /**
   * An ally or a Health-less collider blocks; `opts.pierce` caps the targets hit. Returns the
   * endpoint and the struck ids.
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
   * Damage falls to half at the edge. No friendly fire, and a structure between the centre and a
   * target shadows it; bodies never shadow each other. Returns the struck ids.
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
   * A structure — what a lob lands against and what shadows a blast — is a kinematic collider
   * that is not a standing person; bodies are flown over and looked through.
   */
  isStructure(entities, id) {
    const col = entities.get(id, Collision);
    if (col === undefined || col.kinematic !== true) return false;
    return !entities.has(id, Skeleton);
  },

  _shadowed(level, x0, y0, x1, y1, owner) {
    const all = Query.castAll(level.entities, x0, y0, x1, y1, { ignore: owner });
    for (let i = 0; i < all.length; i++) {
      if (Combat.isStructure(level.entities, all[i].id)) return true;
    }
    return false;
  },

  /**
   * A fused charge whose range is the distance, so it lands on the target point or against the
   * first structure on the way. Returns the charge's id.
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
    entities.add(id, Position, { x: pos.x, y: pos.y });
    entities.add(id, Velocity, { x: nx * spec.speed, y: ny * spec.speed });
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
      penetration: spec.penetration,
    });
    return id;
  },
};

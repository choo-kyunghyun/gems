// Squad follow AI + membership — update() drives EVERY Follower entity by live query (no roster list),
// steering "follow" members toward the player. Contract on the declaration below.
const FOLLOWER_EASE_BAND = 48; // px over `range` across which approach speed ramps to full

/**
 * A "follow" member steers toward the player, easing to a stop near `range` so it settles instead of
 * jittering; "wait" (and any non-member) holds still. Only sets Velocity (SolidSystem integrates/
 * collides). Player id passed in, not stored — no re-link on transfer.
 *
 * Membership (the Squad component) is owned here too: hire() joins the player's squad (+carry bonus,
 * drops the "rehire" Interaction), kick() leaves it PERMANENTLY in place (the companion becomes a map
 * resident with a "rehire" Interaction — talk to re-hire; there is no dismiss-and-recall). setState()
 * is the ONE home for the wait/follow transition + its carry-bonus pairing.
 */
globalThis.FollowerSystem = {
  /**
   * @param {Entity} entities
   * @param {number} playerId
   */
  update(entities, playerId) {
    const pp = entities.get(Position, playerId);
    if (pp === undefined) return;
    const ids = entities.query(Follower);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === playerId) continue;
      const f = entities.get(Follower, id);
      const vel = entities.get(Velocity, id);
      if (f === undefined || vel === undefined) continue;
      // downed or stationed → hold still; only "follow" seeks.
      if (f.state !== "follow" || entities.get(Downed, id) !== undefined) {
        vel.x = 0;
        vel.y = 0;
      } else {
        const pos = entities.get(Position, id);
        const dx = pp.x - pos.x;
        const dy = pp.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > f.range) {
          const ramp = Math.min(1, (dist - f.range) / FOLLOWER_EASE_BAND);
          // terrain movement cost (PathFollow.speedScale) — a companion wades/slogs like everyone
          const speed = f.speed * ramp * PathFollow.speedScale(pos.x, pos.y);
          vel.x = (dx / dist) * speed;
          vel.y = (dy / dist) * speed;
        } else {
          vel.x = 0;
          vel.y = 0;
        }
      }

      // paper-doll drive (opt-in via Animator): idle/walk by velocity + facing flip. Flip by
      // SIGN only — |xscale| carries the baked size factor (see the preset design scale).
      const anim = entities.get(Animator, id);
      if (anim !== undefined) {
        AnimationSystem.set(
          anim,
          vel.x * vel.x + vel.y * vel.y > 1 ? "walk" : "idle",
        );
        const vis = entities.get(Visual, id);
        if (vis !== undefined) {
          if (vel.x < -1) vis.xscale = -Math.abs(vis.xscale);
          else if (vel.x > 1) vis.xscale = Math.abs(vis.xscale);
        }
      }
    }
  },

  /**
   * Every entity carrying the squad id, PLAYER FIRST when present.
   * @param {Entity} entities
   * @param {string} squadId
   * @param {number} playerId
   * @returns {number[]}
   */
  members(entities, squadId, playerId) {
    const out = [];
    const ids = entities.query(Squad);
    for (let i = 0; i < ids.length; i++) {
      if (entities.get(Squad, ids[i]).id !== squadId) continue;
      if (ids[i] === playerId) out.unshift(ids[i]);
      else out.push(ids[i]);
    }
    return out;
  },

  /**
   * The ONE home for the wait/follow transition — pairs the state flip with its carry-bonus
   * delta so the invariant can't be half-applied. No-op if already in `state`.
   * The bonus is baked into the player's live Inventory, and the player migrates as a whole
   * entity, so it rides a map change with no re-apply — never recompute it per map.
   * @param {Entity} entities
   * @param {number} playerId
   * @param {number} fid
   * @param {string} state
   */
  setState(entities, playerId, fid, state) {
    const f = entities.get(Follower, fid);
    if (f === undefined || f.state === state) return;
    if (state === "follow") {
      f.state = "follow";
      FollowerSystem.applyBenefit(entities, playerId, f, 1);
    } else {
      FollowerSystem.applyBenefit(entities, playerId, f, -1);
      f.state = state;
    }
  },

  /**
   * Join the player's squad: membership + follow (+bonus via setState) + drop the "rehire"
   * Interaction (it's a squad member now, not a talk-to-hire resident).
   * @param {Entity} entities
   * @param {number} playerId
   * @param {number} fid
   */
  hire(entities, playerId, fid) {
    const squad = entities.get(Squad, playerId);
    if (squad === undefined || entities.get(Follower, fid) === undefined)
      return;
    entities.add(fid, Squad, { id: squad.id });
    FollowerSystem.setState(entities, playerId, fid, "follow");
    entities.detach(fid, Interaction);
  },

  /**
   * Kick from the squad PERMANENTLY, in place: bonus off (via setState), membership detached,
   * and a "rehire" Interaction attached so walking up + talking (E) re-hires it.
   * @param {Entity} entities
   * @param {number} playerId
   * @param {number} fid
   */
  kick(entities, playerId, fid) {
    FollowerSystem.setState(entities, playerId, fid, "wait");
    entities.detach(fid, Squad);
    entities.add(fid, Interaction, { kind: "rehire" });
  },

  /**
   * Add (sign +1) / remove (-1) a companion's carry bonus (slots + weight cap) on the player's Inventory.
   * balanced delta (like EquipmentSystem._applyContainer) so it never needs a recompute-from-base pass.
   * @param {Entity} entities
   * @param {number} playerId
   * @param {Follower} f
   * @param {number} sign
   */
  applyBenefit(entities, playerId, f, sign) {
    if (f === undefined) return;
    const inv = entities.get(Inventory, playerId);
    if (inv === undefined) return;
    if (f.bonusCapacity) {
      inv.capacity += f.bonusCapacity * sign;
      if (inv.capacity < 0) inv.capacity = 0;
    }
    if (f.bonusWeight && inv.maxWeight !== undefined) {
      inv.maxWeight += f.bonusWeight * sign;
      if (inv.maxWeight < 0) inv.maxWeight = 0;
    }
  },
};

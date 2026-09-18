/**
 * Squad membership and the wait/follow command over a Follower — the one call a view or an
 * interaction makes: hire() joins the player's squad (+carry bonus, swaps the "rehire"
 * Interaction for "companion" — E then flips it wait/follow through toggle()), kick() leaves it
 * PERMANENTLY in place (the companion becomes a map resident with a "rehire" Interaction — talk
 * to re-hire; there is no dismiss-and-recall). setState() is the ONE home for the wait/follow
 * transition + its carry-bonus pairing. The steering itself is FollowerSystem's.
 */
globalThis.Companions = {
  /**
   * Every entity carrying the squad id, PLAYER FIRST when present.
   */
  members(entities, squadId, playerId) {
    const out = [];
    entities.forEach([Squad], (id, sq) => {
      if (sq.id !== squadId) return;
      if (id === playerId) out.unshift(id);
      else out.push(id);
    });
    return out;
  },

  /**
   * The ONE home for the wait/follow transition — pairs the state flip with its carry-bonus
   * delta so the invariant can't be half-applied. No-op if already in `state`.
   * The bonus is baked into the player's live Inventory, and the player migrates as a whole
   * entity, so it rides a map change with no re-apply — never recompute it per map.
   */
  setState(entities, playerId, fid, state) {
    const f = entities.require(fid, Follower);
    if (f.state === state) return;
    if (state === "follow") {
      f.state = "follow";
      Companions._applyBenefit(entities, playerId, f, 1);
    } else {
      Companions._applyBenefit(entities, playerId, f, -1);
      f.state = state;
    }
  },

  /**
   * The state a command would move `fid` to — "wait" for a following member, "follow" for a
   * waiting one — or "" when it is not commandable: no Follower, or Downed (it lies where it fell
   * until it recovers).
   */
  next(entities, fid) {
    if (entities.has(fid, Downed)) return "";
    const f = entities.get(fid, Follower);
    if (f === undefined) return "";
    return f.state === "follow" ? "wait" : "follow";
  },

  /**
   * Flip `fid` between following and waiting here (the E command); returns the state it moved to,
   * or "" when it is not commandable (see next). Waiting is map-local — a trip forces every member
   * back to follow (ColonyMap.go).
   */
  toggle(entities, playerId, fid) {
    const state = Companions.next(entities, fid);
    if (state !== "") Companions.setState(entities, playerId, fid, state);
    return state;
  },

  /**
   * Join the player's squad: membership + follow (+bonus via setState) + the "companion"
   * Interaction over the "rehire" one (it's a squad member now — E commands it, not recruits it).
   */
  hire(entities, playerId, fid) {
    const squad = entities.require(playerId, Squad);
    entities.require(fid, Follower);
    entities.add(fid, Squad, { id: squad.id });
    Companions.setState(entities, playerId, fid, "follow");
    entities.add(fid, Interaction, { kind: "companion" });
  },

  /**
   * Kick from the squad PERMANENTLY, in place: bonus off (via setState), membership detached,
   * and the "rehire" Interaction back over "companion" so walking up + talking (E) re-hires it.
   */
  kick(entities, playerId, fid) {
    Companions.setState(entities, playerId, fid, "wait");
    entities.detach(fid, Squad);
    entities.add(fid, Interaction, { kind: "rehire" });
  },

  /**
   * Add (sign +1) / remove (-1) a companion's carry bonus (slots + weight cap) on the player's Inventory.
   * balanced delta (like Loadout._applyContainer) so it never needs a recompute-from-base pass.
   */
  _applyBenefit(entities, playerId, f, sign) {
    const inv = entities.require(playerId, Inventory);
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

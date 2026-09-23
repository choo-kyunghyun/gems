/**
 * Squad membership and the wait/follow command over a Follower. A hired member follows and adds
 * its carry bonus to the player; a kicked one stays behind as a map resident that can be re-hired
 * by talking to it. setState() is the one home for the wait/follow transition and its bonus.
 */
globalThis.Companions = {
  /** The player first when present. */
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
   * Pairs the state flip with its carry-bonus delta so the two can't drift apart. The bonus is
   * baked into the player's Inventory and travels with it — never re-apply it per map.
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

  /** The state a command would move `fid` to, or "" when it is not commandable. */
  next(entities, fid) {
    if (entities.has(fid, Downed)) return "";
    const f = entities.get(fid, Follower);
    if (f === undefined) return "";
    return f.state === "follow" ? "wait" : "follow";
  },

  /** Returns the state it moved to, or "" when it is not commandable. */
  toggle(entities, playerId, fid) {
    const state = Companions.next(entities, fid);
    if (state !== "") Companions.setState(entities, playerId, fid, state);
    return state;
  },

  hire(entities, playerId, fid) {
    const squad = entities.require(playerId, Squad);
    entities.require(fid, Follower);
    entities.add(fid, Squad, { id: squad.id });
    Companions.setState(entities, playerId, fid, "follow");
    entities.add(fid, Interaction, { kind: "companion" });
  },

  /** The member stays where it stands and can be re-hired. */
  kick(entities, playerId, fid) {
    Companions.setState(entities, playerId, fid, "wait");
    entities.detach(fid, Squad);
    entities.add(fid, Interaction, { kind: "rehire" });
  },

  /** A balanced delta (`sign` ±1), so nothing ever recomputes the capacity from base. */
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

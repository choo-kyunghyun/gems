/**
 * The report seam: every gameplay chokepoint reports what happened once, and the counter,
 * achievement and quest fan-out follows, so no site can bump a tally and forget a consumer. A
 * `passive` quest closes itself once ready; any other is turned in through complete() by its
 * giver. Rewards are items only, no XP, since power comes from equipment and consumables; they go
 * to the player, resolved live.
 *
 * A turn-in re-enters report(); that terminates because a quest is done before its rewards
 * report, so a quest never re-fires itself.
 */
globalThis.Progression = {
  /** Hook: an achievement just unlocked. */
  onUnlock(achId) {},
  /** Hook: a reward landed in the player's bag. */
  onReward() {},

  /** Drop the hooks. */
  reset() {
    Progression.onUnlock = function (achId) {};
    Progression.onReward = function () {};
  },

  /** Returns the tracker's `{ unlocked, ready }` for this report alone. */
  report(entities, kind, target, n = 1) {
    const r = Tracker.report(kind, target, n);
    for (let i = 0; i < r.unlocked.length; i++) {
      Log.info(`achievement unlocked: ${r.unlocked[i]}`);
      Progression.onUnlock(r.unlocked[i]);
    }
    for (let i = 0; i < r.ready.length; i++) {
      const def = QuestLog.def(r.ready[i]);
      if (def !== undefined && def.passive === true)
        Progression.complete(entities, r.ready[i]);
    }
    return r;
  },

  /** The one pickup credit for every loot path, so collect quests can't diverge by path. */
  collect(entities, itemId, qty) {
    const pid = ColonyPlayer.id(entities);
    if (pid !== -1) {
      const pp = entities.require(pid, Position);
      Audio.play({ sound: sndCoin, position: { x: pp.x, y: pp.y } });
    }
    Progression.report(entities, "collect", itemId, qty);
    Log.info(`picked up ${qty}x ${itemId} — items=${Tracker.count("itemsCollected")}`);
  },

  /**
   * The one turn-in ceremony for every path that closes a quest, so they can't drift. The caller
   * checks readiness first.
   */
  complete(entities, qid) {
    Progression._grant(entities, Tracker.complete(qid));
    Progression.report(entities, "quest", qid, 1);
    Log.info(`quest complete: ${qid} — questsCompleted=${Tracker.count("questsCompleted")}`);
  },

  _zone: AABB.rect(), // scratch

  /** Per frame: a Reach region the player enters reports its target once and is removed. */
  reach(level) {
    const entities = level.entities;
    const pid = ColonyPlayer.id(entities);
    if (pid === -1) return;
    const p = AABB.of(entities, pid);
    const zone = Progression._zone;
    entities.forEach([Reach, Position, BBox], (id, r, pos, box) => {
      if (!AABB.overlap(p, AABB.at(pos, box, zone))) return;
      entities.remove(id);
      Progression.report(entities, "reach", r.target, 1);
      Log.info(`reached ${r.target}`);
    });
  },

  /** Reward items count toward the collect rules like any other pickup. */
  _grant(entities, reward) {
    if (reward === undefined || reward.items === undefined) return;
    const inv = entities.require(ColonyPlayer.id(entities), Inventory);
    for (let i = 0; i < reward.items.length; i++) {
      const it = reward.items[i];
      Bag.add(inv, it.itemId, it.qty);
      Progression.report(entities, "collect", it.itemId, it.qty);
    }
    Progression.onReward();
  },
};

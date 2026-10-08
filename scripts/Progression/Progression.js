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
    Progression.collectAll(entities, [{ itemId: itemId, qty: qty }]);
  },

  /** Several pickups at once, `[{ itemId, qty }]`, under one chime. */
  collectAll(entities, items) {
    const pid = ColonyPlayer.id(entities);
    if (pid !== -1) {
      const pp = entities.require(pid, Position);
      Audio.play({ sound: sndCoin, position: { x: pp.x, y: pp.y } });
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      Progression.report(entities, "collect", it.itemId, it.qty);
      Log.info(`picked up ${it.qty}x ${it.itemId} — items=${Tracker.count("itemsCollected")}`);
    }
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

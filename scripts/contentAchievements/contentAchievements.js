/**
 * Colony achievement defs and their trigger rules, as the tracker's rules hook: one gameplay
 * report drives both stages — counterOf names the counter an event kind feeds, then report turns a
 * met threshold into an unlock request. The engine holds no conditions and never sweeps.
 */
globalThis.contentAchievements = {
  registered: false,

  register() {
    if (contentAchievements.registered) return;
    contentAchievements.registered = true;

    Achievement.register([
      {
        id: "td_first_kill",
        name: "ACH_FIRST_KILL_NAME",
        desc: "ACH_FIRST_KILL_DESC",
      },
      {
        id: "td_slayer",
        name: "ACH_SLAYER_NAME",
        desc: "ACH_SLAYER_DESC",
      },
      {
        id: "td_collector",
        name: "ACH_COLLECTOR_NAME",
        desc: "ACH_COLLECTOR_DESC",
      },
      {
        id: "td_quester",
        name: "ACH_QUESTER_NAME",
        desc: "ACH_QUESTER_DESC",
      },
      {
        id: "td_time_skip",
        name: "ACH_TIME_SKIP_NAME",
        desc: "ACH_TIME_SKIP_DESC",
      },
      // TODO: no trigger rule yet — building a room and placing a bed
      {
        id: "td_home_builder",
        name: "ACH_HOME_BUILDER_NAME",
        desc: "ACH_HOME_BUILDER_DESC",
      },
    ]);
  },

  // A kind absent here bumps nothing; a counter with no RULES entry is tallied but unlocks nothing.
  COUNTERS: {
    kill: "enemiesKilled", // any species
    collect: "itemsCollected",
    quest: "questsCompleted",
    sleepSkip: "sleepFastForwards",
  },

  /** Undefined for none. */
  counterOf(kind) {
    return contentAchievements.COUNTERS[kind];
  },

  // Per lifetime counter: reaching `at` requests the unlock. Data, not closures — the engine never
  // evaluates a condition.
  RULES: {
    enemiesKilled: [
      { at: 1, id: "td_first_kill" },
      { at: 10, id: "td_slayer" },
    ],
    itemsCollected: [{ at: 10, id: "td_collector" }],
    questsCompleted: [{ at: 1, id: "td_quester" }],
    // a sleep's fast-forward reaching its ceiling
    sleepFastForwards: [{ at: 1, id: "td_time_skip" }],
  },

  /**
   * A counter just changed to `value`; every met rule becomes an unlock request, which dedups.
   * Returns the newly unlocked ids.
   */
  report(key, value) {
    const newly = [];
    const rules = contentAchievements.RULES[key];
    if (rules === undefined) return newly;
    for (let i = 0; i < rules.length; i++) {
      if (value >= rules[i].at && Tracker.unlock(rules[i].id))
        newly.push(rules[i].id);
    }
    return newly;
  },
};

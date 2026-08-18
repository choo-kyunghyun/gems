// Colony achievement CONTENT — the defs plus the trigger rules mapping a gameplay counter onto unlock
// requests. Called once from sceneColony.create() (not top-level — GMRT load-order). Idempotent.
/**
 * Separated from contentQuests (quest data) so each content family has one home. The Achievement engine
 * holds no conditions and never sweeps: a gameplay chokepoint that bumps a Profile counter reports it
 * here (the trigger), and the matching threshold rules issue Achievement.unlock(id) requests.
 */
globalThis.contentAchievements = {
  registered: false,

  register() {
    if (this.registered) return;
    this.registered = true;

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
      // Placeholder — def only, no trigger rule yet (stays Locked until a gameplay site reports
      // it; the Debug section's Unlock All covers testing). Planned trigger: building a room +
      // placing a bed (needs room detection).
      {
        id: "td_home_builder",
        name: "ACH_HOME_BUILDER_NAME",
        desc: "ACH_HOME_BUILDER_DESC",
      },
    ]);
  },

  // Threshold rules per lifetime counter: reaching `at` on that counter requests the unlock.
  // Data, not closures — the engine never evaluates a condition.
  RULES: {
    enemiesKilled: [
      { at: 1, id: "td_first_kill" },
      { at: 10, id: "td_slayer" },
    ],
    itemsCollected: [{ at: 10, id: "td_collector" }],
    questsCompleted: [{ at: 1, id: "td_quester" }],
    // bumped by sceneColony when a sleep's Time.scale ramp hits the ×20 ceiling
    sleepFastForwards: [{ at: 1, id: "td_time_skip" }],
  },

  /**
   * The trigger: a gameplay site reports a counter it just changed (key + new value); every met
   * rule becomes an unlock REQUEST (Achievement.unlock dedups). Returns newly-unlocked ids so the
   * caller can toast them.
   */
  report(key, value) {
    const newly = [];
    const rules = this.RULES[key];
    if (rules === undefined) return newly;
    for (let i = 0; i < rules.length; i++) {
      if (value >= rules[i].at && Achievement.unlock(rules[i].id))
        newly.push(rules[i].id);
    }
    return newly;
  },
};

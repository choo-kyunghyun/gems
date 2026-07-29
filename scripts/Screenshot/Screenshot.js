/**
 * Screenshot — screen capture into `screenshots/` under the save dir
 * (game_save_id-rooted: a relative path lands in the build tree — docs/GMRT.md
 * → working_directory). take() queues; update() saves the queue and must run
 * LAST in obj_game/Draw_75 — Draw GUI End is the only event screen_save
 * permits, and a shot captures only what was drawn before the call — so a
 * take() anywhere up to that point lands the same frame. `hotkey` takes a
 * timestamped shot. Agent harness: a temp Time.frame timeline in Step_0
 * (CLAUDE.md → Screenshots). Autonames read the GML date built-ins: JS Date
 * is UTC-pinned and second-granular on GMRT (docs/GMRT.md), so current_time
 * (ms since boot) de-dupes same-second shots.
 */
globalThis.Screenshot = {
  /** @type {number} key polled by keyboard_check_pressed for a manual shot */
  hotkey: vk_f5,
  /** @type {(string|null)[]} filenames to save this frame; null = autoname */
  _pending: [],

  /**
   * save a shot this frame; name is a filename ("shot.png"), default timestamped
   * @param {string} [name]
   */
  take(name) {
    Screenshot._pending.push(name ?? null);
  },

  update() {
    if (keyboard_check_pressed(Screenshot.hotkey)) Screenshot.take();
    for (let i = 0; i < Screenshot._pending.length; i++) {
      const path =
        game_save_id +
        "screenshots/" +
        (Screenshot._pending[i] ?? Screenshot._autoname());
      screen_save(path);
      Log.info("screenshot " + path);
    }
    Screenshot._pending.length = 0;
  },

  /**
   * @returns {string}
   */
  _autoname() {
    const dt = date_current_datetime();
    /**
     * @param {number} n
     * @returns {string}
     */
    const pad2 = (n) => String(n).padStart(2, "0");
    return (
      "gems-" +
      date_get_year(dt) +
      pad2(date_get_month(dt)) +
      pad2(date_get_day(dt)) +
      "-" +
      pad2(date_get_hour(dt)) +
      pad2(date_get_minute(dt)) +
      pad2(date_get_second(dt)) +
      "-" +
      current_time +
      ".png"
    );
  },
};

/**
 * Screen capture into `screenshots/` under the save dir (rooted at game_save_id: a relative path
 * lands in the build tree — docs/GMRT.md). take() queues; update() saves the queue and must run
 * LAST in Draw GUI End — the only event screen_save permits — so a take() anywhere earlier lands
 * the same frame. Autonames use the GML date built-ins (JS Date is UTC-pinned and second-granular
 * — docs/GMRT.md), with current_time de-duping same-second shots.
 */
globalThis.Screenshot = {
  hotkey: vk_f5,
  /** Filenames to save this frame; null = autoname. */
  _pending: [],

  /** `name` is a filename ("shot.png"); omitted, the shot is timestamped. */
  take(name) {
    Screenshot._pending.push(name ?? null);
  },

  update() {
    if (Input.keyPressed(Screenshot.hotkey)) Screenshot.take();
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

  _autoname() {
    const dt = date_current_datetime();
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

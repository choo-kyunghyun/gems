globalThis.LevelTransition = {
  duration: 0.12, // seconds per direction — short so swaps feel responsive
  color: c_black,
  alpha: 0,

  _phase: 0, // 0 idle, 1 fading out, 2 fading in
  _t: 0, // seconds elapsed in current phase
  _apply: null, // level-swap callback, fired once at full cover

  /** LevelManager holds the pending level until this clears. */
  isBusy() {
    return LevelTransition._phase !== 0;
  },

  /** `applyFn` runs once at full cover. */
  start(applyFn) {
    LevelTransition._apply = applyFn;
    LevelTransition._phase = 1;
    LevelTransition._t = 0;
  },

  /** Fade in from cover with no preceding fade-out (boot: first level from black). */
  reveal() {
    LevelTransition._apply = null;
    LevelTransition._phase = 2;
    LevelTransition._t = 0;
    LevelTransition.alpha = 1;
  },

  /** Fires the swap at full cover (Step_0). */
  update() {
    if (LevelTransition._phase === 0) return;
    LevelTransition._t += Time.raw;
    const p = clamp(LevelTransition._t / LevelTransition.duration, 0, 1);
    const eased = Tween.easeInOutQuad(p);

    if (LevelTransition._phase === 1) {
      LevelTransition.alpha = eased;
      if (p >= 1) {
        if (LevelTransition._apply !== null) {
          LevelTransition._apply();
          LevelTransition._apply = null;
        }
        LevelTransition._phase = 2;
        LevelTransition._t = 0;
        LevelTransition.alpha = 1;
      }
    } else {
      LevelTransition.alpha = 1 - eased;
      if (p >= 1) {
        LevelTransition._phase = 0;
        LevelTransition.alpha = 0;
      }
    }
  },

  /** Draw_75, last — veils the UI rebuild. */
  draw() {
    if (LevelTransition.alpha <= 0) return;
    const a = draw_get_alpha();
    const c = LevelTransition.color;
    draw_set_alpha(LevelTransition.alpha);
    draw_rectangle_color(
      0,
      0,
      display_get_gui_width(),
      display_get_gui_height(),
      c,
      c,
      c,
      c,
      false,
    );
    draw_set_alpha(a);
  },
};

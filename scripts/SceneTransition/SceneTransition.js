// full-screen fade between scenes. standalone singleton (not UIComponent).
// fade-out → swap level at full cover → fade-in, so the UI rebuild is hidden under the cover.
// timer uses Time.raw so the fade ignores Time.scale.
globalThis.SceneTransition = {
  duration: 0.12, // seconds per direction — short so swaps feel responsive
  color: c_black, // cover color
  alpha: 0, // current cover alpha [0,1]

  _phase: 0, // 0 idle, 1 fading out, 2 fading in
  _t: 0, // seconds elapsed in current phase
  _apply: null, // level-swap callback, fired once at full cover

  /** @returns {boolean} fade running — LevelManager holds the pending level until this clears. */
  isBusy() {
    return SceneTransition._phase !== 0;
  },

  /** begin a fade-out; `applyFn` runs once at full cover. @param {() => void} applyFn */
  start(applyFn) {
    SceneTransition._apply = applyFn;
    SceneTransition._phase = 1;
    SceneTransition._t = 0;
  },

  /** fade in from cover with no preceding fade-out (boot: first level from black). */
  reveal() {
    SceneTransition._apply = null;
    SceneTransition._phase = 2;
    SceneTransition._t = 0;
    SceneTransition.alpha = 1;
  },

  /** advance the fade timer; fire the swap at full cover (Step_0). */
  update() {
    if (SceneTransition._phase === 0) return;
    SceneTransition._t += Time.raw;
    const p = clamp(SceneTransition._t / SceneTransition.duration, 0, 1);
    const eased = Tween.easeInOutQuad(p);

    if (SceneTransition._phase === 1) {
      SceneTransition.alpha = eased; // 0 → 1
      if (p >= 1) {
        // fully covered: swap hidden, then fade back in
        if (SceneTransition._apply !== null) {
          SceneTransition._apply();
          SceneTransition._apply = null;
        }
        SceneTransition._phase = 2;
        SceneTransition._t = 0;
        SceneTransition.alpha = 1;
      }
    } else {
      SceneTransition.alpha = 1 - eased; // 1 → 0
      if (p >= 1) {
        SceneTransition._phase = 0;
        SceneTransition.alpha = 0;
      }
    }
  },

  /** draw the cover at current alpha (Draw_75, last — veils the UI rebuild). */
  draw() {
    if (SceneTransition.alpha <= 0) return;
    const a = draw_get_alpha();
    const c = SceneTransition.color;
    draw_set_alpha(SceneTransition.alpha);
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

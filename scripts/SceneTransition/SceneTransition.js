globalThis.SceneTransition = {
  duration: 0.12, // seconds per direction — short so swaps feel responsive
  color: c_black,
  alpha: 0,

  _phase: 0, // 0 idle, 1 fading out, 2 fading in
  _t: 0, // seconds elapsed in current phase
  _apply: null, // scene-swap callback, fired once at full cover

  /** The Game object holds the pending scene until this clears. */
  isBusy() {
    return SceneTransition._phase !== 0;
  },

  /** `applyFn` runs once at full cover. */
  start(applyFn) {
    SceneTransition._apply = applyFn;
    SceneTransition._phase = 1;
    SceneTransition._t = 0;
  },

  /** Fade in from cover with no preceding fade-out (boot: first scene from black). */
  reveal() {
    SceneTransition._apply = null;
    SceneTransition._phase = 2;
    SceneTransition._t = 0;
    SceneTransition.alpha = 1;
  },

  /** Fires the swap at full cover (Step_0). */
  update() {
    if (SceneTransition._phase === 0) return;
    SceneTransition._t += Time.raw;
    const p = clamp(SceneTransition._t / SceneTransition.duration, 0, 1);
    const eased = Tween.easeInOutQuad(p);

    if (SceneTransition._phase === 1) {
      SceneTransition.alpha = eased;
      if (p >= 1) {
        if (SceneTransition._apply !== null) {
          SceneTransition._apply();
          SceneTransition._apply = null;
        }
        SceneTransition._phase = 2;
        SceneTransition._t = 0;
        SceneTransition.alpha = 1;
      }
    } else {
      SceneTransition.alpha = 1 - eased;
      if (p >= 1) {
        SceneTransition._phase = 0;
        SceneTransition.alpha = 0;
      }
    }
  },

  /** Draw_75, last — veils the UI rebuild. */
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

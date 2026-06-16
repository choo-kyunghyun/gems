/**
 * SceneTransition — full-screen fade between scenes. Standalone static singleton (NOT
 * a UIComponent), like Tooltip / Toast / UINav.
 *
 * Replaces obj_game's hard cut on `openScene`: instead of swapping scenes the same
 * frame, `start(applyFn)` runs a fade-OUT to a solid cover, swaps the scene at full
 * cover (calling `applyFn` once — which rebuilds the UI, hidden under the cover), then
 * fades back IN. The cover is drawn last in Draw_75 (after the UI), so it veils the UI
 * tear-down/rebuild too.
 *
 * Wiring: `SceneTransition.update()` in Step_0 (drives the timer + fires the swap at
 * mid-fade); `SceneTransition.draw()` last in Draw_75. GMRT: the timer uses Time.raw
 * (wall-clock) so the fade ignores Time.scale; the curve comes from Tween.
 */
globalThis.SceneTransition = class SceneTransition {
  static duration = 0.12; // seconds per direction (out, then in) — kept short so scene changes feel responsive
  static color = c_black; // cover color
  static alpha = 0; // current cover alpha [0,1] — read by draw()

  static _phase = 0; // 0 idle, 1 fading out (→cover), 2 fading in (→clear)
  static _t = 0; // seconds elapsed in the current phase
  static _apply = null; // the scene-swap callback, fired once at full cover

  /**
   * @returns {boolean} whether a fade is running — SceneManager holds the pending scene until
   * this clears so a second openScene mid-fade can't stack two swaps.
   */
  static isBusy() {
    return SceneTransition._phase !== 0;
  }

  /** Begin a fade-out; `applyFn` (the scene swap) runs once at full cover. @param {() => void} applyFn */
  static start(applyFn) {
    SceneTransition._apply = applyFn;
    SceneTransition._phase = 1;
    SceneTransition._t = 0;
  }

  /** Fade in from a solid cover with no preceding fade-out (boot: first scene fades in from black). */
  static reveal() {
    SceneTransition._apply = null;
    SceneTransition._phase = 2;
    SceneTransition._t = 0;
    SceneTransition.alpha = 1;
  }

  /** Advance the fade timer and fire the swap at full cover (Step_0). */
  static update() {
    if (SceneTransition._phase === 0) return;
    SceneTransition._t += Time.raw;
    const p = clamp(SceneTransition._t / SceneTransition.duration, 0, 1);
    const eased = Tween.easeInOutQuad(p);

    if (SceneTransition._phase === 1) {
      SceneTransition.alpha = eased; // 0 → 1
      if (p >= 1) {
        // Fully covered: swap the scene (hidden), then fade back in.
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
  }

  /** Draw the cover at the current alpha (Draw_75, last — veils the UI rebuild too). */
  static draw() {
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
  }
};

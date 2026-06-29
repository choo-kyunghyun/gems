// Pure static easing helpers — callers own their animated state and pass current/target each frame.
// `approach` defaults to Time.raw (wall-clock) so UI easing ignores time dilation; pass Time.delta for sim-space motion.
globalThis.Tween = class Tween {
  static lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Exponential smoothing. Clamp prevents overshoot on a hitched frame.
  static approach(current, target, speed, dt = Time.raw) {
    return current + (target - current) * clamp(dt * speed, 0, 1);
  }

  // No color helper: GMRT — merge_color floors each term (packed int drifts dark), and rounding a
  // packed-int lerp loses sub-1 steps so the tween freezes at high FPS. Ease r/g/b as FLOATS via
  // approach() per channel (see UIButton._easeColor) — float state accumulates correctly at any FPS.

  // easing curves: t∈[0,1] → eased [0,1]
  static linear(t) {
    return t;
  }
  static easeInQuad(t) {
    return t * t;
  }
  static easeOutQuad(t) {
    return t * (2 - t);
  }
  static easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5;
  }
  static easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  // overshoots then settles — a subtle "pop" on enter.
  static easeOutBack(t) {
    const c = 1.70158;
    const p = t - 1;
    return 1 + (c + 1) * p * p * p + c * p * p;
  }
};

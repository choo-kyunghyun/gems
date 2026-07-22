// Pure static easing helpers — callers own their animated state and pass current/target each frame.
// `approach` defaults to Time.raw (the clock split); pass Time.delta for sim-space motion.
globalThis.Tween = {
  // Exponential smoothing. Clamp prevents overshoot on a hitched frame.
  approach(current, target, speed, dt = Time.raw) {
    return current + (target - current) * clamp(dt * speed, 0, 1);
  },

  // No color helper — merge_color is unsafe to ease per frame (#15546). Ease r/g/b as FLOATS via
  // approach() per channel (see UIButton._easeColor).

  // easing curves: t∈[0,1] → eased [0,1]
  linear(t) {
    return t;
  },
  easeInQuad(t) {
    return t * t;
  },
  easeOutQuad(t) {
    return t * (2 - t);
  },
  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) * 0.5;
  },
  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  },
  // overshoots then settles — a subtle "pop" on enter.
  easeOutBack(t) {
    const c = 1.70158;
    const p = t - 1;
    return 1 + (c + 1) * p * p * p + c * p * p;
  },
};

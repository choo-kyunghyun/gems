/**
 * Tween — shared easing + frame-rate-independent smoothing for UI motion. A plain
 * static helper (not a UIComponent / not instanced): all methods are pure, so callers
 * keep their own animated state and just pass current/target each frame.
 *
 * Two families:
 *   - `approach` / `approachColor` — exponential smoothing toward a *moving* target
 *     (no fixed duration). This is the pattern UIButton used inline for its hover/press
 *     color + shadow easing; factored out here.
 *   - the easing *curves* (`easeOutCubic`, …) — map a normalized progress t∈[0,1] to an
 *     eased [0,1], for *timed* 0→1 motion (Toast's enter slide, future enter/exit).
 *
 * GMRT: `approach` defaults its delta to `Time.raw` (wall-clock) — UI must ignore
 * `Time.scale` so menus don't slow/freeze when the sim dilates or pauses time. Pass an
 * explicit `dt` (e.g. `Time.delta`) for sim-space motion. The curves are pure math.
 */
globalThis.Tween = class Tween {
  // Plain linear interpolate.
  static lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Exponential smoothing of `current` toward `target`. `speed` is a per-second rate
  // (higher = snappier); `dt` defaults to wall-clock so UI ignores time dilation. The
  // clamp keeps it stable when a frame hitches (f never exceeds 1 → no overshoot).
  static approach(current, target, speed, dt = Time.raw) {
    return current + (target - current) * clamp(dt * speed, 0, 1);
  }

  // approach() for GameMaker color ints (channel-wise blend via merge_color).
  static approachColor(current, target, speed, dt = Time.raw) {
    return merge_color(current, target, clamp(dt * speed, 0, 1));
  }

  // ── easing curves: t∈[0,1] → eased [0,1] ──────────────────────────
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
  // Overshoots past 1 then settles — a subtle "pop" for enter motion.
  static easeOutBack(t) {
    const c = 1.70158;
    const p = t - 1;
    return 1 + (c + 1) * p * p * p + c * p * p;
  }
};

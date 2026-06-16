/**
 * The frame clock. `obj_game` calls `update()` once per Step before the scene
 * steps, so every consumer reads a consistent per-frame delta. Sim/gameplay use
 * `delta` (dilatable/pausable via `scale`); UI uses `raw` (wall-clock) so menus
 * never slow or freeze when the sim dilates time.
 */
globalThis.Time = class Time {
  /** @type {number} wall-clock seconds since last frame (ignores `scale`). */
  static raw = 0;
  /** @type {number} time dilation: 0 = paused, 1 = normal, >1 = fast. */
  static scale = 1;
  /** @type {number} scaled seconds since last frame (`raw * scale`) — sim time. */
  static delta = 0;

  /** Recompute `raw`/`delta` from the runtime's `delta_time` (µs). */
  static update() {
    Time.raw = delta_time / 1000000;
    Time.delta = Time.raw * Time.scale;
  }
};

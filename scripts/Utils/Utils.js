// Standalone helpers shared across the codebase.

/** No-op default callback. */
globalThis.noop = function noop() {};

/** A random RFC-4122 v4 UUID. */
globalThis.uuid = function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/**
 * Pure 2D position hash → float in [0, 1); deterministic in (x, y, seed) — the shared home for
 * seeded worldgen/terrain hashing. Float math only (`sin`/`floor`): bitwise overflow
 * computes wrong values on GMRT (docs/GMRT.md), so never "simplify" this to a bitwise hash.
 */
globalThis.hash2 = function hash2(x, y, seed) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.123) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Value noise in [0, 1): smoothstep-interpolated over a hashed integer lattice (`lattice` = blob
 * spacing in cells); pure in (x, y, seed, lattice), so a generator's every query replays from its
 * seed. Fold a salt into `seed` to draw an independent channel.
 */
globalThis.noise2 = function noise2(x, y, seed, lattice) {
  const fx = x / lattice;
  const fy = y / lattice;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let tx = fx - ix;
  let ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx); // smoothstep for blobby, non-grid-aligned regions
  ty = ty * ty * (3 - 2 * ty);
  const v00 = hash2(ix, iy, seed);
  const v10 = hash2(ix + 1, iy, seed);
  const v01 = hash2(ix, iy + 1, seed);
  const v11 = hash2(ix + 1, iy + 1, seed);
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
};

/**
 * An animation-curve asset's channel (index or name) evaluated at `t`; the runtime clamps `t` to
 * [0, 1], so a curve is the easing primitive. Nothing is cached: the per-call channel lookup is
 * negligible, and a hot loop can hoist `animcurve_get_channel` itself.
 */
globalThis.curve = function curve(ac, t, channel = 0) {
  return animcurve_channel_evaluate(animcurve_get_channel(ac, channel), t);
};

/**
 * Exponential smoothing of `current` toward `target`; `dt` defaults to Time.raw (the clock split),
 * so pass Time.delta for sim-space motion. The clamp prevents overshoot on a hitched frame.
 */
globalThis.approach = function approach(current, target, speed, dt = Time.raw) {
  return lerp(current, target, clamp(dt * speed, 0, 1));
};

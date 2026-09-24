/**
 * @typedef {Object} Visual
 * @property {boolean} visible
 * @property {GMSprite} sprite
 * @property {number} subimg
 * @property {number} [scale] design size (preset SCALE x per-spawn override); xscale/yscale are
 *   the DERIVED draw scale (scale / the sprite's density, sign = facing). Absent = raw
 *   xscale/yscale, never refit on a sheet swap.
 * @property {number} xscale
 * @property {number} yscale
 * @property {number} rot
 * @property {number} color
 * @property {number} alpha
 * @property {number} speed
 * @property {number} time
 */
globalThis.Visual = "Visual";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Visual] = {
  visible: true,
  subimg: 0,
  xscale: 1,
  yscale: 1,
  rot: 0,
  color: c_white,
  alpha: 1,
  speed: 0,
  time: 0,
};

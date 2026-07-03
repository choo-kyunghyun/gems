/**
 * @typedef {Object} Visual
 * @property {boolean} visible
 * @property {Asset.GMSprite} sprite
 * @property {number} subimg
 * @property {number} [scale] design size (preset SCALE x per-spawn override); xscale/yscale are
 *   the DERIVED draw scale (scale / SpriteMeta.density(sprite), sign = facing). Absent = legacy
 *   raw xscale/yscale (AnimationSystem then never refits on a sheet swap).
 * @property {number} xscale
 * @property {number} yscale
 * @property {number} rot
 * @property {number} color
 * @property {number} alpha
 * @property {number} speed
 * @property {number} time
 */
globalThis.Visual = "Visual";

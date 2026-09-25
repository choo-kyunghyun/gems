/**
 * The entity's sprite, as GameMaker's own instance draw variables describe one — `sprite_index`,
 * `image_index`, `image_speed`, `image_xscale`/`_yscale`, `image_angle`, `image_blend`,
 * `image_alpha`, `visible` — whatever the sheet: a strip or a skeletal (Spine) sheet, told apart
 * by `anim`, the set a skeletal sheet plays (`skeleton_animation_set`). A skeletal sheet is posed
 * by the runtime on the entity's puppet, so `index` is the strip's alone; `anim`, `loop` and
 * `speed` change through `Anim`, which carries them to the puppet.
 *
 * @typedef {Object} Sprite
 * @property {GMSprite} sprite  the sheet
 * @property {number} index     the subimage, fractional as `image_index` is
 * @property {number} speed     `image_speed`: a multiplier over the sheet's own speed (0 = hold)
 * @property {boolean} loop     wrap past the last frame, else hold it
 * @property {string} [anim]    the skeletal set playing now; authored with a skeletal sheet,
 *                              absent on a strip
 * @property {number} xscale    sign = facing
 * @property {number} yscale
 * @property {number} angle
 * @property {number} blend     tint over the whole body, worn gear included — a skin or coat
 *                              goes on `tints`
 * @property {Object} tints     skeletal slot name -> colour on that slot alone, multiplied under
 *                              `blend`; an absent slot draws as authored
 * @property {number} alpha
 * @property {boolean} visible
 */
globalThis.Sprite = "Sprite";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Sprite] = {
  index: 0,
  speed: 1,
  loop: true,
  xscale: 1,
  yscale: 1,
  angle: 0,
  blend: c_white,
  tints: {},
  alpha: 1,
  visible: true,
};

/**
 * Skeletal body: a Spine sprite bound to the entity's puppet, played by the runtime off the
 * puppet's own clock and drawn through `draw_self` — the one path that poses, advances and
 * honours matrix_world, and ~4x cheaper than `draw_skeleton`. An entity carries this or a
 * {Visual}, never both, or its body draws twice. The puppet mirrors a field only when it is
 * changed through the rig's setters; writing a field directly leaves the puppet on the old value.
 *
 * @typedef {Object} Skeleton
 * @property {GMSprite} sprite  skeletal (Spine) sheet, bound when the puppet is minted
 * @property {string} anim            animation set playing now; authored at spawn, no default
 * @property {boolean} loop           wrap past the last frame, else hold it
 * @property {number} speed           playback rate over authored time (0 = hold the pose)
 * @property {number} xscale          draw scale, sign = facing
 * @property {number} yscale
 * @property {number} color           tint over the whole rig, worn gear included — whole-body
 *                                   effects only; a skin or coat goes on `tints`
 * @property {Object} tints           slot name -> colour on that slot alone, multiplied under
 *                                   `color`; an absent slot draws as authored. Replayed at each
 *                                   mint, like an attachment
 * @property {number} alpha
 */

globalThis.Skeleton = "Skeleton";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Skeleton] = {
  loop: true,
  speed: 1,
  xscale: 1,
  yscale: 1,
  color: c_white,
  tints: {},
  alpha: 1,
};

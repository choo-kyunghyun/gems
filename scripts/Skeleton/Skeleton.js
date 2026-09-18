/**
 * SKELETAL category of the art projection contract (RenderBillboard): a Spine sprite bound to
 * the entity's Puppet, played by the runtime off the puppet's own `image_index` clock, and drawn
 * through `draw_self` — the one path that poses, advances and honours matrix_world
 * (the manual's draw_sprite note), ~4x cheaper than `draw_skeleton` on the pinned runtime. The counterpart of
 * Visual: an entity carries one or the other, never both, since RenderBillboard scans the two
 * separately and would draw the body twice.
 *
 * The puppet is SkeletonSystem's: it mints one, binds `sprite`, and mirrors every field here
 * onto it WHEN THE FIELD CHANGES — through Rig.set (`anim`, `loop`), .rate (`speed`),
 * .tint (`tints`) and .apply (the transform). Writing a field here directly leaves the puppet
 * on the old value.
 *
 * @typedef {Object} Skeleton
 * @property {GMSprite} sprite  skeletal (Spine) sheet, bound to the puppet when it is minted
 * @property {string} anim            animation set playing now (Rig.set to change);
 *                                   authored at spawn with a set the sheet carries — no default
 * @property {boolean} loop           wrap past the last frame, else hold it
 * @property {number} speed           playback rate over authored time (1 = as authored in Spine,
 *                                   0 = hold the pose); Rig.rate to change
 * @property {number} xscale          draw scale, sign = facing (image_xscale)
 * @property {number} yscale
 * @property {number} color           tint (image_blend) over the WHOLE rig, worn gear included
 *                                   (the manual's composite) — whole-body effects only; a skin or coat goes on `tints`
 * @property {Object} tints           slot name -> colour on that slot alone (a humanoid's skin, a rat's
 *                                   coat), multiplied under `color`; a slot absent here draws its art as
 *                                   authored. Per-puppet state like an attachment, so it is
 *                                   replayed at each mint
 * @property {number} alpha
 */
globalThis.Skeleton = "Skeleton";

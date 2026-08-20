/**
 * SKELETAL category of the art projection contract (RenderBillboard): a Spine sprite posed by
 * the runtime and drawn through its Puppet's `draw_self`, the one path that both poses and
 * honours matrix_world (docs/GMRT.md) — and ~4x cheaper than `draw_skeleton` (docs/PERF.md →
 * Skeletal Animation). The counterpart of Visual: an entity carries one or the other, never
 * both, since RenderBillboard scans the two separately and would draw the body twice.
 *
 * Playback is SkeletonSystem's: it mints the puppet, binds `sprite`, and advances `frame`
 * itself. Change animation through SkeletonSystem.set — writing `anim` here leaves the puppet
 * playing the old set.
 *
 * @typedef {Object} Skeleton
 * @property {Asset.GMSprite} sprite  skeletal (Spine) sheet, bound to the puppet when it is minted
 * @property {string} anim            animation set playing now (SkeletonSystem.set to change)
 * @property {boolean} loop           wrap past the last frame, else hold it
 * @property {number} fps             playback rate in skeleton frames/sec (0 = hold `frame`)
 * @property {number} frame           playback position in frames, fractional
 * @property {number} xscale          draw scale, sign = facing (image_xscale)
 * @property {number} yscale
 * @property {number} color           tint (image_blend)
 * @property {number} alpha
 */
globalThis.Skeleton = "Skeleton";

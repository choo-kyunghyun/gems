/**
 * Data-driven sprite state machine. Controller sets `state`; AnimationSystem advances playback
 * into the entity's Visual. Requires Visual to render.
 *
 * @typedef {Object} AnimState
 * @property {Asset.GMSprite} sprite
 * @property {number} frames   number of subimages in this state
 * @property {number} fps      playback rate (0 = static, hold frame 0)
 * @property {boolean} loop    restart at 0 when past the last frame
 *
 * @typedef {Object} Animator
 * @property {Object<string, AnimState>} graph   state name -> AnimState
 * @property {string} state                       current state name
 * @property {number} frame                        current subimage index
 * @property {number} time                         seconds accumulated in frame
 */
globalThis.Animator = "Animator";

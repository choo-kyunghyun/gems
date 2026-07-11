// Marks THE input-driven entity (PlayerSystem queries it — the player is found live, never a
// stored id) and carries the brain's per-tick state. Flat scalars only, so it rides
// EntitySnapshot/map transfer with the rest of the player sheet.
// @typedef {Object} Playable
// @property {number} fireCd   ticks until the next shot/swing
// @property {number} attackCd ticks the attack pose stays up (drives the Animator state)
// @property {string} attackAnim melee anim latched at swing ("attack"|"kick"; "" = none yet) —
//                    the unarmed fist fallback alternates punch/kick by flipping this
// @property {number} cursorX  ground-plane world cursor, latched once per frame by the scene
// @property {number} cursorY  (Camera.cursorWorld — mouse_x/y are wrong under the pitched camera)
globalThis.Playable = "Playable";

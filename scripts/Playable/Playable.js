/**
 * Marks the input-driven entity — the player is found live, never by a stored id — and carries
 * its per-frame input state. Flat scalars only, so it travels with the player.
 *
 * @typedef {Object} Playable
 * @property {number} fireCd   seconds until the next shot/swing
 * @property {number} attackCd seconds the attack pose stays up
 * @property {string} attackAnim "attack"|"kick", latched at the swing; "" = none yet
 * @property {number} cursorX  the aim point, latched once per frame: what the cursor visibly
 *                   covers, not the ground cursor
 * @property {number} cursorY
 */
globalThis.Playable = "Playable";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Playable] = {
  fireCd: 0,
  attackCd: 0,
  attackAnim: "",
  cursorX: 0,
  cursorY: 0,
};

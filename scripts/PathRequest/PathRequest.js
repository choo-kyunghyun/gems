/**
 * @typedef {Object} PathRequest
 * @property {number} startX
 * @property {number} startY
 * @property {number} goalX
 * @property {number} goalY
 */
globalThis.PathRequest = "PathRequest";
// any script may load first (docs/GMRT.md)
(globalThis.Mint ??= {})[PathRequest] = true; // rebuilt at runtime, never saved

/**
 * Point-light component.
 * @typedef {Object} Light
 * @property {number} radius        world px; fades to 0 at the edge
 * @property {number} color         GM color int
 * @property {number} intensity     0..1
 * @property {number} flicker       0..1 amplitude; 0 = steady
 */
globalThis.Light = "Light";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Light] = { intensity: 1, flicker: 0 };

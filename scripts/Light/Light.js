/**
 * Point-light component.
 * @typedef {Object} Light
 * @property {number} radius        world px; fades to 0 at the edge
 * @property {number} color         GM color int
 * @property {number} [intensity]   0..1, default 1
 * @property {number} [flicker]     0..1 amplitude; 0 or omitted = steady
 */
globalThis.Light = "Light";

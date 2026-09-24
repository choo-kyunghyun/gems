/**
 * A growing plant — the one component every tree and crop carries. Pure data, so a map's plants
 * park, save and restore exactly as the player left them.
 * @typedef {Object} Growth
 * @property {string} species    species id
 * @property {number} progress   0..1 toward ripe (1 = harvestable); a regrowing species falls back
 *   below 1 on harvest
 * @property {number} stage      the visual step last applied (0..stages−1), cached off progress so a
 *   tick redraws only on a change; −1 before the first apply
 * @property {boolean} wild      the generator's or a spread seedling (counts toward the biome's flora
 *   cap and seeds neighbours), as against a built crop
 */
globalThis.Growth = "Growth";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Growth] = { progress: 0, stage: -1, wild: false };

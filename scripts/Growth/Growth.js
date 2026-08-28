/**
 * A growing plant — the one component every tree and crop carries, driven by FloraSystem over the
 * contentFlora species table. Pure data, so a plant parks, saves and restores with its store like
 * any entity, and a map's stand of trees is exactly the state the player left.
 * @typedef {Object} Growth
 * @property {string} species    contentFlora species id
 * @property {number} progress   0..1 toward ripe (1 = harvestable); a regrowing species falls back
 *   below 1 on harvest
 * @property {number} stage      the visual step last applied (0..stages−1), cached off progress so a
 *   tick redraws only on a change; −1 before the first apply
 * @property {number} base       the specimen's full-size Mesh.scale (the preset's size variety) —
 *   the stage factor multiplies it
 * @property {boolean} wild      the generator's or a spread seedling (counts toward the biome's flora
 *   cap and seeds neighbours), as against a built crop
 */
globalThis.Growth = "Growth";

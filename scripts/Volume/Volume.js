/**
 * VOLUME category of the art projection contract (ROADMAP.md — Art Rework): an axis-aligned
 * box for boxy furniture/machines (bench, table, bed, crate, terminal), drawn by RenderVolume
 * as real depth-writing geometry so bodies sort against deep furniture per-pixel — no manual
 * layering. Position is the footprint CENTER (BBox convention); `height` rises toward the
 * camera (world -z, the RenderBillboard convention). Flat, export-safe scalars only: face
 * sprites are NAMES resolved at draw time (sprite_exists-guarded, like UISlots), colors are
 * GM ints — a color fills the face when its sprite is unset, and tints the sprite when set.
 *
 * @typedef {Object} Volume
 * @property {number} width       footprint x extent (world px)
 * @property {number} depth       footprint y extent (world px)
 * @property {number} height      vertical extent (world px)
 * @property {number} topColor    plan-view top face fill / sprite tint
 * @property {number} frontColor  elevation front face fill / sprite tint
 * @property {string} [topSprite]   sprite NAME stretched over the top face ("" = flat fill)
 * @property {string} [frontSprite] sprite NAME stretched over the front face ("" = flat fill)
 * @property {number} [alpha]     whole-box alpha (default 1; keep faces opaque — see RenderVolume)
 */
globalThis.Volume = "Volume";

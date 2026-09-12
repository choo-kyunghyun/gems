/**
 * Starred itemIds — flat string[] (set semantics via indexOf; never a JS Set — it is snapshot data, and a Set serializes empty, docs/GMRT.md).
 * Carried in the player-sheet snapshot across maps. View-only (no gameplay effect). Operations live
 * in FavoritesSystem.
 *
 * @typedef {Object} Favorites
 * @property {string[]} ids  favorited itemIds (unordered)
 */
globalThis.Favorites = "Favorites";

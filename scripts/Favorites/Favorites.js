/**
 * Starred itemIds — flat string[] (set semantics via indexOf; never a JS Set — iterates broken on GMRT).
 * Carried in the player-sheet snapshot across maps. View-only (no gameplay effect). Operations live
 * in FavoritesSystem.
 *
 * @typedef {Object} Favorites
 * @property {string[]} ids  favorited itemIds (unordered)
 */
globalThis.Favorites = "Favorites";

/**
 * Starred itemIds — flat string[] (set semantics via indexOf; never a JS Set — iterates broken on GMRT).
 * Carried in the player-sheet snapshot across maps. View-only (no gameplay effect).
 *
 * @typedef {Object} Favorites
 * @property {string[]} ids  favorited itemIds (unordered)
 */
globalThis.Favorites = "Favorites";

/** stateless operations on a Favorites component */
globalThis.FavoritesSystem = {
  has(fav, itemId) {
    return fav.ids.indexOf(itemId) >= 0;
  },

  /**
   * toggle star; returns new state (true = now favorited)
   */
  toggle(fav, itemId) {
    const i = fav.ids.indexOf(itemId);
    if (i >= 0) {
      fav.ids.splice(i, 1);
      return false;
    }
    fav.ids.push(itemId);
    return true;
  },
};

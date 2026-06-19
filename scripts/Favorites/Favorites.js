// Favorited items on the player: a set of itemIds the player has starred, kept as a flat string
// array (set semantics via indexOf — never a JS Set, which iterates broken on GMRT). Rides
// world.export / EntitySnapshot like Inventory.slots, carried across maps in RpgMap.go's
// player-sheet snapshot. Drives a marker column + a "Favorites" filter in the inventory; purely
// a quality-of-life view concern (no gameplay effect), so it lives Demo-side.
//
// @typedef {Object} Favorites
// @property {string[]} ids  favorited itemIds (unordered set)
globalThis.Favorites = "Favorites";

// Genre-agnostic operations on a Favorites component (no world tick), the project's System pattern.
globalThis.FavoritesSystem = {
  has(fav, itemId) {
    return fav.ids.indexOf(itemId) >= 0;
  },

  // Toggle itemId's favorited state; returns the new state (true = now favorited).
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

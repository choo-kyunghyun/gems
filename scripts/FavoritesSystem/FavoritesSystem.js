// Stateless operations on a Favorites component (no world tick) — the star list is view-only, so
// nothing here touches gameplay state.
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

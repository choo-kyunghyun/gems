// Stateless operations on a Favorites component; the star list is view-only, never gameplay state.
globalThis.Star = {
  has(fav, itemId) {
    return fav.ids.indexOf(itemId) >= 0;
  },

  /** Returns true when now favorited. */
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

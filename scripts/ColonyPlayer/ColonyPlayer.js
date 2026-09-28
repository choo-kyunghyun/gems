// The colony's player: the entity resolved live, and the cursor-to-world aim its shots resolve
// against.

// Silhouette px up a body that the cursor means when it is over no body at all. Bodies are drawn
// standing, so the cursor's ground point sits behind whatever it visibly covers; reading the plane
// this high cancels that.
const AIM_H = 16;

globalThis.ColonyPlayer = {
  /** The player entity, resolved live so a map transfer can't dangle it; -1 when none. */
  id(entities) {
    return entities.first(Playable);
  },

  /**
   * The world point the player is pointing at. Under the pitched camera the cursor covers a
   * body's standing silhouette while the sim tests its ground footprint, so the silhouette picks
   * which body and the footprint says where. Over no body it answers the aim plane. Both reads
   * take the cursor off `view`, so they cannot disagree.
   */
  aim(entities, shooterId, view) {
    const pitch = view.pitch;
    const cursor = view.cursorWorld(); // the ground cursor; silhouette height is measured off it
    // Health is the shootable set: a corpse has none, so it never swallows the aim off a live
    // body standing over it
    const target = Silhouette.pick(entities, cursor, pitch, {
      has: Health,
      ignore: shooterId,
    });
    if (target !== -1) {
      const box = entities.get(target, BBox);
      if (box !== undefined) {
        const pos = entities.require(target, Position);
        return {
          x: pos.x + box.x + box.width * 0.5,
          y: pos.y + box.y + box.height * 0.5,
        };
      }
    }
    return view.cursorWorld(-AIM_H * RenderBillboard.tall(pitch));
  },
};

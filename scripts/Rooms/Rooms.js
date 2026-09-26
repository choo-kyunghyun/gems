/**
 * The rooms of a level: the zones its walls close off, a room being any zone past OUTSIDE.
 *
 * Two sources, each with its own refresh: the bounding layers' edit logs (`sync`) and the
 * stamped footprints (`stamp`), so a doorway closes a room whether its leaf is open or shut.
 * A derivation is one whole-level labeling, paid on a change only, never per frame.
 */
globalThis.Rooms = class Rooms {
  /**
   * @param {LevelGrid} tiles
   * @param {LevelLayer[]} layers the layers whose occupied cells bound a room
   */
  constructor(tiles, layers) {
    this.layers = layers;
    this.map = new ZoneMap(tiles);
    this._cursor = new EditCursor(); // where the map was derived in the layers' logs
    this._synced = false; // the first sync derives
    this._stamps = []; // own copies, world px, x2/y2 exclusive
    /** @type {function(number, number): boolean} */
    this._blocked = (x, y) => {
      const layers = this.layers;
      for (let i = 0; i < layers.length; i++) if (layers[i].get(x, y)) return true; // 0 = empty
      return false;
    };
  }

  destroy() {
    this.map.destroy();
    this.layers = undefined;
  }

  /** Returns whether it re-derived. */
  sync() {
    if (this._cursor.poll(this.layers) === 0) return false;
    this._synced = true;
    this._derive();
    return true;
  }

  /**
   * Compared by value, so a caller may hand the same scratch every frame. Returns whether it
   * re-derived.
   */
  stamp(rects) {
    const held = this._stamps;
    let same = held.length === rects.length;
    if (same) {
      for (let i = 0; i < rects.length; i++) {
        const a = held[i];
        const b = rects[i];
        if (a.x1 !== b.x1 || a.y1 !== b.y1 || a.x2 !== b.x2 || a.y2 !== b.y2) {
          same = false;
          break;
        }
      }
    }
    if (same) return false;
    held.length = 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      held.push({ x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 });
    }
    if (this._synced) this._derive(); // else the first sync derives with these
    return true;
  }

  _derive() {
    this.map.label(this._blocked, this._stamps);
  }
};

// How warm a world point stands, read off the level's room mirror and temperature record. It
// reads them only; it keeps neither.
globalThis.Shelter = {
  /** Kelvin: the point's room's, or the outside's. */
  tempAt(level, wx, wy) {
    const map = RoomSystem.rooms(level).map;
    const r = map.atWorld(wx, wy);
    if (r <= 0) return Temperature.now();
    const rec = level.entities.get(level.self, RoomSystem.KEY);
    if (rec === undefined) return Temperature.now();
    const t = rec.temps[String(map.zones[r].first)];
    return t !== undefined ? t : Temperature.now();
  },
};

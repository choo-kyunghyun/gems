// Where a world point stands — under a roof or not, and how warm — read off the level's room
// mirror and temperature record. It reads them only; it keeps neither.
globalThis.Shelter = {
  /** Inside a room, or anywhere on an indoor map. */
  sheltered(level, wx, wy) {
    if (level.entities.get(level.self, ColonyMap.INDOOR) === true) return true;
    return RoomSystem.rooms(level).map.atWorld(wx, wy) > 0;
  },

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

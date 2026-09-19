// Where a world point stands, read off the level's room mirror and temperature record
// (RoomSystem's MIRROR and KEY on the level's own entity): under a roof or not, and how warm — the queries the
// environmental needs (ExposureSystem/ColdSystem) and the HUD ask. The mirror and the
// temperatures themselves are RoomSystem's to keep.
globalThis.Shelter = {
  /** Whether a world point is under a roof: inside a room, or anywhere on an indoor map. */
  sheltered(level, wx, wy) {
    if (level.entities.get(level.self, ColonyMap.INDOOR) === true) return true;
    return RoomSystem.rooms(level).atWorld(wx, wy) > 0;
  },

  /** The temperature at a world point in Kelvin: its room's, or the outside's. */
  tempAt(level, wx, wy) {
    const rooms = RoomSystem.rooms(level);
    const r = rooms.atWorld(wx, wy);
    if (r <= 0) return Temperature.now();
    const rec = level.entities.get(level.self, RoomSystem.KEY);
    if (rec === undefined) return Temperature.now();
    const t = rec.temps[String(rooms.rooms[r].first)];
    return t !== undefined ? t : Temperature.now();
  },
};

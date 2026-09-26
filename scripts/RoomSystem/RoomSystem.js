/**
 * The rooms of a level: enclosure and warmth over a room mirror of the wall layer. Feeds the
 * mirror its doors, stamped by footprint so a doorway closes a room whether the leaf is open or
 * shut, and holds one temperature per room in Kelvin under KEY.
 *
 * A lumped model — one heat capacity per room, no cell field: a room converges to the outside at
 * LEAK per in-game hour plus DOOR_LEAK per open door, raised by the heat sources standing in it
 * (equilibrium = outside + Σpower / (leak × cells), so a source warms a closet more than a hall).
 * Each step is the closed form T_eq + (T − T_eq)·e^(−k·dh), so a parked map's whole absence is the
 * same call as one frame, with the outside over the absence taken as the arrival's. A room's
 * warmth keys by its first cell, so a wall edit that keeps that cell keeps its warmth; a room that
 * vanishes drops off the record on the next step.
 *
 * `update` runs once per frame before the sim, the mirror first so this frame's readers see it.
 */
globalThis.RoomSystem = {
  KEY: "rooms", // a data key: a save holds it
  MIRROR: "rooms_mirror", // derived, never saved
  LEAK: 0.6, // 1/h — a sealed room closes ≈ 45% of its gap to the outside each in-game hour
  DOOR_LEAK: 1.5, // 1/h more per open door
  // scratch, reused every step
  _rects: [],
  _power: [],
  _leak: [],

  /** Only the wall layer bounds a room: a fence has no roof. */
  rooms(level) {
    return level.entities.derive(
      level.self,
      RoomSystem.MIRROR,
      () => new Rooms(level.grid, [ColonyMap.runtime(level).wallLayer]),
    );
  },

  _sync(level, rooms) {
    const entities = level.entities;
    const rects = RoomSystem._rects;
    let n = 0;
    entities.forEach([Interaction, Position, BBox], (id, it, pos, box) => {
      if (it.kind !== "door") return;
      if (rects.length <= n) rects.push({ x1: 0, y1: 0, x2: 0, y2: 0 });
      const r = rects[n++];
      r.x1 = pos.x + box.x;
      r.y1 = pos.y + box.y;
      r.x2 = r.x1 + box.width;
      r.y2 = r.y1 + box.height;
    });
    rects.length = n;
    rooms.stamp(rects);
    rooms.sync();
  },

  /** A first call on a map starts its clock, every room at the outside temperature. */
  update(level) {
    const rooms = RoomSystem.rooms(level);
    RoomSystem._sync(level, rooms);
    const map = rooms.map;
    const rec = level.entities.of(level.self, RoomSystem.KEY, () => ({
      lastHour: WorldClock.absHours(),
      temps: {},
    }));
    const dh = WorldClock.catchUp(rec, 0);
    if (dh === 0) return;

    const list = map.zones;
    const n = list.length;
    const power = RoomSystem._power;
    const leak = RoomSystem._leak;
    power.length = n;
    leak.length = n;
    for (let r = 0; r < n; r++) {
      power[r] = 0;
      leak[r] = RoomSystem.LEAK;
    }
    const entities = level.entities;
    entities.forEach([Heat, Position], (id, h, pos) => {
      const r = map.atWorld(pos.x, pos.y);
      if (r > 0) power[r] += h.power;
    });
    // a door's own cell is a wall, so it leaks the rooms around it
    const grid = level.grid;
    const cols = grid.cols;
    entities.forEach([Interaction, Position], (id, it, pos) => {
      if (it.kind !== "door") return;
      if (it.open !== 1) return;
      const i = grid.cellAt(pos.x, pos.y);
      if (i < 0) return;
      const gx = i % cols;
      const gy = (i - gx) / cols;
      const a = map.at(gx - 1, gy);
      const b = map.at(gx + 1, gy);
      const c = map.at(gx, gy - 1);
      const e = map.at(gx, gy + 1);
      if (a > 0) leak[a] += RoomSystem.DOOR_LEAK;
      if (b > 0 && b !== a) leak[b] += RoomSystem.DOOR_LEAK;
      if (c > 0 && c !== a && c !== b) leak[c] += RoomSystem.DOOR_LEAK;
      if (e > 0 && e !== a && e !== b && e !== c) leak[e] += RoomSystem.DOOR_LEAK;
    });

    const out = Temperature.now();
    const temps = {};
    for (let r = 1; r < n; r++) {
      const room = list[r];
      const key = String(room.first);
      const held = rec.temps[key];
      const t = held !== undefined ? held : out;
      const k = leak[r];
      const eq = out + power[r] / (k * room.cells);
      temps[key] = eq + (t - eq) * Math.exp(-k * dh);
    }
    rec.temps = temps; // rebuilt, so a vanished room's key goes with it
  },

};

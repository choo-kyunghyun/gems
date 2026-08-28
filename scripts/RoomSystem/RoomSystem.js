/**
 * The rooms of a level — enclosure and warmth over the Core `Rooms` mirror. Feeds the mirror its
 * doors (the built door props, Interaction kind "door", stamped by footprint so a doorway closes a
 * room whether the leaf is open or shut) and holds one TEMPERATURE per room in Kelvin, off one
 * whole-map record (LevelMeta KEY → { lastHour, temps }). A lumped model — one heat capacity per
 * room, no cell field: the outside is Temperature.now() (the sky, the season, the map's climate);
 * a room converges to it at LEAK per in-game hour plus DOOR_LEAK per open door, raised by the
 * Heat sources standing in it (equilibrium = outside + Σpower / (leak × cells), so a source warms a
 * closet more than a hall). Each step is the closed form T_eq + (T − T_eq)·e^(−k·dh), so a parked
 * map's whole absence is the same call as one frame — no off-focus sim, like FloraSystem's flora
 * clock (the outside over the absence is taken as the arrival's). `temps` keys by the room's
 * `first` cell (Rooms), so a wall edit that keeps a room's top-left cell keeps its warmth; a room
 * that vanishes drops off the record on the next step.
 *
 * Takes the scene (the map's runtime: `rooms`, the layer handles, the level), like FloraSystem.
 */
globalThis.RoomSystem = {
  KEY: "rooms", // its LevelMeta key — a data key (a save holds it)
  LEAK: 0.6, // 1/h — a sealed room closes 1 − e^-0.6 ≈ 45% of its gap to the outside each in-game hour
  DOOR_LEAK: 1.5, // 1/h more per open door
  _rects: [], // scratch: the doors' footprints handed to Rooms.stamp (the rect objects are reused)
  _power: [], // scratch: per-room Heat sum for the step
  _leak: [], // scratch: per-room leak rate for the step

  /**
   * Mirror maintenance, once per frame outside the tick loop (beside NavGrid.sync): the doors
   * standing in the store are the stamped footprints, then the walls are resampled if edited.
   */
  sync(scene) {
    const entities = scene.level.entities;
    const rects = RoomSystem._rects;
    let n = 0;
    entities.forEach([Interaction, Position, BBox], (id, it) => {
      if (it.kind !== "door") return;
      if (rects.length <= n) rects.push(AABB.rect());
      AABB.ofInto(entities, id, rects[n]);
      n++;
    });
    rects.length = n;
    scene.rooms.stamp(rects);
    scene.rooms.sync();
  },

  /**
   * Step every room's temperature up to `now` (WorldClock.absHours); a first call on a map without
   * the record starts its clock, every room at the outside temperature.
   */
  update(scene, now) {
    const level = scene.level;
    let rec = level.meta.get(RoomSystem.KEY);
    if (rec === undefined) {
      rec = { lastHour: now, temps: {} };
      level.meta.set(RoomSystem.KEY, rec);
      return;
    }
    const dh = now - rec.lastHour;
    if (dh <= 0) return;
    rec.lastHour = now;

    const rooms = scene.rooms;
    const list = rooms.rooms;
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
      const r = rooms.atWorld(pos.x, pos.y);
      if (r > 0) power[r] += h.power;
    });
    // an open door leaks every room it touches (its cell is a wall — read the four neighbours)
    entities.forEach([Interaction, Position], (id, it, pos) => {
      if (it.kind !== "door") return;
      if (it.open !== 1) return;
      const gx = Math.floor(pos.x / rooms.cellW);
      const gy = Math.floor(pos.y / rooms.cellH);
      const a = rooms.at(gx - 1, gy);
      const b = rooms.at(gx + 1, gy);
      const c = rooms.at(gx, gy - 1);
      const e = rooms.at(gx, gy + 1);
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
    rec.temps = temps; // rebuilt each step: a vanished room's key goes with it
  },

  /** Whether a world point is under a roof: inside a room, or anywhere on an indoor map. */
  sheltered(scene, wx, wy) {
    if (scene.level.meta.get(ColonyMap.INDOOR) === true) return true;
    return scene.rooms.atWorld(wx, wy) > 0;
  },

  /** The temperature at a world point in Kelvin: its room's, or the outside's. */
  tempAt(scene, wx, wy) {
    const r = scene.rooms.atWorld(wx, wy);
    if (r <= 0) return Temperature.now();
    const rec = scene.level.meta.get(RoomSystem.KEY);
    if (rec === undefined) return Temperature.now();
    const t = rec.temps[String(scene.rooms.rooms[r].first)];
    return t !== undefined ? t : Temperature.now();
  },
};

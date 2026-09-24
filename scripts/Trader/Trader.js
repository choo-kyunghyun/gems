/**
 * Wandering traders on the world timeline, advanced only by scheduled arrive/depart events. A
 * trader dwelling on a resident map is an entity of that map's level, parked or active alike; in
 * transit, or dwelling on a map with no level, it is a whole-entity record its next event
 * carries, moved into the level once that map is built and back out before the level is freed.
 *
 * The route records live on the world's own entity, so they start blank with the world and ride
 * its save. install() runs once per scene create.
 *
 * A dwell's depart event names the embodied trader (`ent`), else holds -1 and the record
 * (`snap`), absent before the first embodiment. The id survives a save because a level restores
 * with its ids.
 */
globalThis.Trader = {
  KEY: "traders", // a save holds it
  DWELL: 6, // in-game hours at a stop that names none

  /** `{ recs: id -> { id, name, route, travelH, merchant, idx } }` */
  state() {
    return World.table.of(World.self, Trader.KEY, () => ({ recs: {} }));
  },

  install() {
    WorldEvents.on("trader_arrive", (d) => Trader._arrive(d));
    WorldEvents.on("trader_depart", (d) => Trader._depart(d));
  },

  /**
   * def: { id, name, route:[{map,dwellH}], travelH, merchant }, hours throughout. The trader
   * starts dwelling at the route's first stop.
   */
  register(def) {
    const rec = {
      id: def.id,
      name: def.name,
      route: def.route,
      travelH: def.travelH ?? 2,
      merchant: def.merchant,
      idx: 0,
    };
    Trader.state().recs[def.id] = rec;
    Trader._dwell(rec, undefined);
    Log.info(`trader ${rec.id}: home ${rec.route[0].map}, ${rec.route.length} stops`);
  },

  /** Move every trader dwelling on the level's map off-level into it; call once the map is built. */
  deliver(level) {
    const recs = Trader.state().recs;
    const dwells = WorldEvents.queued("trader_depart");
    for (let i = 0; i < dwells.length; i++) {
      const d = dwells[i];
      if (d.ent !== -1 || d.map !== level.id) continue;
      const rec = recs[d.id];
      if (rec === undefined) continue;
      d.ent = Trader._embody(level, rec, d.snap);
      delete d.snap;
    }
  },

  /**
   * Move every trader embodied on the level back into its depart event; call before the level is
   * freed. One no longer in the store ends its route here, as its depart would.
   */
  recall(level) {
    const recs = Trader.state().recs;
    const dwells = WorldEvents.queued("trader_depart");
    for (let i = 0; i < dwells.length; i++) {
      const d = dwells[i];
      if (d.ent === -1 || d.map !== level.id) continue;
      if (level.entities.isValid(d.ent)) {
        d.snap = World.take(level.id, d.ent);
        Log.info(`trader ${d.id} recalled from ${level.id}`);
      } else {
        delete recs[d.id];
        Log.info(`trader ${d.id} is gone from ${level.id}; its route ends`);
      }
      d.ent = -1;
    }
    level.entities.flush();
  },

  /** A dwell at the route's current stop: embodied when its map is resident, carried otherwise. */
  _dwell(rec, snap) {
    const stop = rec.route[rec.idx];
    const level = World.get(stop.map);
    const d = { id: rec.id, map: stop.map, ent: -1 };
    if (level !== null) d.ent = Trader._embody(level, rec, snap);
    else if (snap !== undefined) d.snap = snap;
    WorldEvents.schedule(
      WorldClock.absHours() + (stop.dwellH ?? Trader.DWELL),
      "trader_depart",
      d,
    );
  },

  _depart(d) {
    const recs = Trader.state().recs;
    const rec = recs[d.id];
    if (rec === undefined) return;
    let snap = d.snap;
    if (d.ent !== -1) {
      const level = World.get(d.map);
      if (level === null || !level.entities.isValid(d.ent)) {
        delete recs[d.id];
        Log.info(`trader ${rec.id} is gone from ${d.map}; its route ends`);
        return;
      }
      snap = World.take(d.map, d.ent);
      level.entities.flush(); // a parked level never flushes on its own
    }
    rec.idx = (rec.idx + 1) % rec.route.length;
    const next = { id: rec.id };
    if (snap !== undefined) next.snap = snap;
    WorldEvents.schedule(WorldClock.absHours() + rec.travelH, "trader_arrive", next);
    Log.info(`trader ${rec.id} departed → ${rec.route[rec.idx].map} (transit)`);
  },

  _arrive(d) {
    const rec = Trader.state().recs[d.id];
    if (rec === undefined) return;
    Trader._dwell(rec, d.snap);
    Log.info(`trader ${rec.id} arrived at ${rec.route[rec.idx].map}`);
  },

  /** Beside the map's spawn, its market point, from the record or fresh from the def; returns the id. */
  _embody(level, rec, snap) {
    const spawn = ColonyMap.of(level).spawn;
    const sg = level.grid.worldToGrid(spawn.x, spawn.y);
    const gx = sg.x + 3;
    const gy = sg.y;
    let id;
    if (snap !== undefined) {
      const w = level.grid.gridToWorld(gx, gy);
      id = World.put(level.id, snap, {
        [Position]: { x: w.x, y: w.y, z: 0 },
      });
    } else {
      id = ColonySpawn.spawnEntity(level.entities, level.grid, {
        preset: "npc",
        gx: gx,
        gy: gy,
        label: rec.name,
        nameKey: rec.name,
        merchant: rec.merchant,
      });
    }
    Log.info(`trader ${rec.id} embodied in ${level.id} as ent ${id}`);
    return id;
  },
};

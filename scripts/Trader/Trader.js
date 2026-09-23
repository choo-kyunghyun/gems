/**
 * Wandering traders on the world timeline. Off-screen a trader is a record, advanced only by
 * scheduled arrive/depart events; in the active map it is hydrated into a vendor entity, and on
 * leave or depart it dehydrates back into a whole-entity snapshot. A trader is an entity in exactly
 * one place — the map you're standing in.
 *
 * The records live on the world's own entity, so they start blank with the world and ride its
 * save; handlers reach the active level through the world, never a held scene. install() runs once
 * per scene create.
 *
 * A record's `entId` is the live entity while embodied, else -1; it survives a save because the
 * active map restores with its ids, so the record re-links instead of hydrating a copy. `snap`,
 * once set, is the authoritative living state.
 */
globalThis.Trader = {
  KEY: "traders", // a save holds it

  /** `{ recs: id -> record }` */
  state() {
    return World.table.of(World.self, Trader.KEY, () => ({ recs: {} }));
  },

  install() {
    WorldEvents.on("trader_arrive", (d) => Trader._arrive(d));
    WorldEvents.on("trader_depart", (d) => Trader._depart(d));
  },

  /**
   * `level` is the active level. def: { id, name, route:[{map,dwellH}], travelH, merchant }, hours
   * throughout.
   */
  register(level, def) {
    const rec = {
      id: def.id,
      name: def.name,
      route: def.route,
      travelH: def.travelH ?? 2,
      merchant: def.merchant,
      idx: 0,
      map: def.route[0].map,
      inTransit: false,
      entId: -1,
      snap: undefined,
    };
    Trader.state().recs[def.id] = rec;
    WorldEvents.schedule(
      WorldClock.absHours() + (rec.route[0].dwellH ?? 6),
      "trader_depart",
      { id: rec.id },
    );
    Trader._tryHydrate(level, rec);
    Log.info(`trader ${rec.id}: home ${rec.map}, ${rec.route.length} stops`);
  },

  onActivate(level) {
    const recs = Trader.state().recs;
    for (const id in recs) Trader._tryHydrate(level, recs[id]);
  },
  onSuspend(level) {
    const recs = Trader.state().recs;
    for (const id in recs) {
      const rec = recs[id];
      if (rec.entId !== -1) Trader._dehydrate(level, rec);
    }
  },

  // the handlers fire whatever map is active.
  _depart(d) {
    const rec = Trader.state().recs[d.id];
    if (rec === undefined) return;
    const level = World.active();
    if (rec.entId !== -1 && level !== null) Trader._dehydrate(level, rec);
    rec.inTransit = true;
    rec.idx = (rec.idx + 1) % rec.route.length;
    WorldEvents.schedule(WorldClock.absHours() + rec.travelH, "trader_arrive", {
      id: rec.id,
    });
    Log.info(`trader ${rec.id} departed → ${rec.route[rec.idx].map} (transit)`);
  },
  _arrive(d) {
    const rec = Trader.state().recs[d.id];
    if (rec === undefined) return;
    rec.inTransit = false;
    rec.map = rec.route[rec.idx].map;
    const level = World.active();
    if (level !== null) Trader._tryHydrate(level, rec);
    WorldEvents.schedule(
      WorldClock.absHours() + (rec.route[rec.idx].dwellH ?? 6),
      "trader_depart",
      { id: rec.id },
    );
    Log.info(`trader ${rec.id} arrived at ${rec.map}`);
  },

  _tryHydrate(level, rec) {
    if (rec.inTransit || rec.entId !== -1) return;
    if (level.id !== rec.map) return;
    Trader._hydrate(level, rec);
  },
  _hydrate(level, rec) {
    // the player spawn is each map's market point, so no map authors coords.
    const spawn = ColonyMap.of(level).spawn;
    const sg = level.grid.worldToGrid(spawn.x, spawn.y);
    const gx = sg.x + 3;
    const gy = sg.y;
    if (rec.snap !== undefined) {
      const w = level.grid.gridToWorld(gx, gy);
      rec.entId = World.put(level.id, rec.snap, {
        [Position]: { x: w.x, y: w.y, z: 0 },
      });
    } else {
      rec.entId = ColonySpawn.spawnEntity(level.entities, level.grid, {
        preset: "npc",
        gx: gx,
        gy: gy,
        label: rec.name,
        nameKey: rec.name,
        merchant: rec.merchant,
      });
    }
    Log.info(`trader ${rec.id} hydrated in ${level.id} as ent ${rec.entId}`);
  },
  _dehydrate(level, rec) {
    rec.snap = World.take(level.id, rec.entId);
    rec.entId = -1;
    Log.info(`trader ${rec.id} dehydrated from ${level.id}`);
  },
};

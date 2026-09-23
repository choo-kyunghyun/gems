/**
 * Wandering traders driven by WorldEvents.
 *
 * Off-screen a trader is NOT an entity — it's a flat RECORD tagged with a map id, advanced by discrete
 * scheduled events (trader_arrive / trader_depart) on the WorldClock timeline, no per-frame sim. When
 * its map is the ACTIVE one the record is HYDRATED into a real Merchant NPC entity (via ColonySpawn — so
 * TradeUI / TradeSystem / _npcActivate treat it like any vendor); on leave/depart it DEHYDRATES back
 * to the record (living state captured as a whole-entity snapshot through World). So a trader is an
 * entity in exactly one place — the map you're standing in.
 *
 * Logic over ONE world record (World.self under KEY — { recs }), so the traders start blank with
 * the world and ride the save with its records; the handlers reach the active level through
 * World.active(), never a held scene. install() wires the handlers — once per scene create, after
 * World.reset drops the previous wiring.
 *
 * A record: { id, name, route:[{map,dwellH}], travelH, merchant, idx, map, inTransit, entId, snap }
 *   route     ordered stops (map id + hours to dwell there); travelH = hours in transit between stops
 *   merchant  the descriptor ColonySpawn builds the vendor from on the FIRST hydrate (stock/margins/mode)
 *   map       current map when settled; inTransit true while travelling between stops
 *   entId     live entity id while embodied in the active map, else -1. Stays meaningful across a
 *             save: the active map's store restores whole (ids included), so the entity comes
 *             back under the same id and the record re-links to it instead of hydrating a copy.
 *   snap      whole-entity snapshot after the first dehydrate (authoritative living state thereafter)
 */
globalThis.Trader = {
  KEY: "traders", // its token on the world's own entity — a data key (a save holds it)

  /** The traders record — `{ recs: id -> record }`. */
  state() {
    return World.table.of(World.self, Trader.KEY, () => ({ recs: {} }));
  },

  /** Wire the arrive/depart handlers on WorldEvents (scene create, after World.reset). */
  install() {
    WorldEvents.on("trader_arrive", (d) => Trader._arrive(d));
    WorldEvents.on("trader_depart", (d) => Trader._depart(d));
  },

  /**
   * Define a wandering trader + start its schedule. `level` is the active level (hydrate now if its
   * first stop is the map you're in). def: { id, name, route:[{map,dwellH}], travelH, merchant }.
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

  /**
   * Map (re)activated: embody every settled trader whose current map is this one.
   */
  onActivate(level) {
    const recs = Trader.state().recs;
    for (const id in recs) Trader._tryHydrate(level, recs[id]);
  },
  /**
   * Map about to suspend: dehydrate every trader embodied in it (living state → its record).
   */
  onSuspend(level) {
    const recs = Trader.state().recs;
    for (const id in recs) {
      const rec = recs[id];
      if (rec.entId !== -1) Trader._dehydrate(level, rec);
    }
  },

  // ── event handlers (fire from WorldEvents.update, whatever map is active) ──
  _depart(d) {
    const rec = Trader.state().recs[d.id];
    if (rec === undefined) return;
    const level = World.active();
    if (rec.entId !== -1 && level !== null) Trader._dehydrate(level, rec); // embodied here → pull it out first
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
    if (level !== null) Trader._tryHydrate(level, rec); // arrived where the player is?
    WorldEvents.schedule(
      WorldClock.absHours() + (rec.route[rec.idx].dwellH ?? 6),
      "trader_depart",
      { id: rec.id },
    );
    Log.info(`trader ${rec.id} arrived at ${rec.map}`);
  },

  // ── hydrate / dehydrate at the active-map boundary ──
  // Embody a settled trader IF its map is the given (active) one and it isn't already embodied.
  _tryHydrate(level, rec) {
    if (rec.inTransit || rec.entId !== -1) return;
    if (level.id !== rec.map) return;
    Trader._hydrate(level, rec);
  },
  _hydrate(level, rec) {
    // near the map's player spawn (each map's own "market point" — avoids per-map authored coords)
    const spawn = ColonyMap.of(level).spawn;
    const sg = level.grid.worldToGrid(spawn.x, spawn.y);
    const gx = sg.x + 3;
    const gy = sg.y;
    if (rec.snap !== undefined) {
      // re-embody living state (whole-entity restore into the active level)
      const w = level.grid.gridToWorld(gx, gy);
      rec.entId = World.put(level.id, rec.snap, {
        [Position]: { x: w.x, y: w.y, z: 0 },
      });
    } else {
      // first time: build the vendor fresh from the descriptor (single entity path, ColonySpawn)
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
  // the whole entity → the held snapshot; a page open on it closes on its own once the id is
  // gone (Interactable's range-close)
  _dehydrate(level, rec) {
    rec.snap = World.take(level.id, rec.entId);
    rec.entId = -1;
    Log.info(`trader ${rec.id} dehydrated from ${level.id}`);
  },
};

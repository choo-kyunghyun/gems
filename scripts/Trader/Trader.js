// Wandering traders — merchants that cross the map graph off-focus, driven entirely by WorldEvents.
// A static singleton (Game); the reference consumer of WorldEvents + World.levels (LevelManager).
/**
 * Off-screen a trader is NOT an entity — it's a flat RECORD tagged with a map id, advanced by discrete
 * scheduled events (trader_arrive / trader_depart) on the WorldClock timeline, no per-frame sim. When
 * its map is the ACTIVE one the record is HYDRATED into a real Merchant NPC entity (via RpgSpawn — so
 * TradeUI / TradeSystem / _npcActivate treat it like any vendor); on leave/depart it DEHYDRATES back
 * to the record (living state captured as a whole-entity snapshot through Universe). So a trader is an
 * entity in exactly one place — the map you're standing in.
 *
 * A record: { id, name, route:[{map,dwellH}], travelH, merchant, idx, map, inTransit, entId, snap }
 *   route     ordered stops (map id + hours to dwell there); travelH = hours in transit between stops
 *   merchant  the descriptor RpgSpawn builds the vendor from on the FIRST hydrate (stock/margins/mode)
 *   map       current map when settled; inTransit true while travelling between stops
 *   entId     live entity id while embodied in the active map, else -1
 *   snap      whole-entity snapshot after the first dehydrate (authoritative living state thereafter)
 */
globalThis.Trader = {
  _recs: {}, // id -> record
  _level: null, // the active RPG level — handlers reach the active store/map through it
  _installed: false, // WorldEvents handlers registered once

  /** Register the arrive/depart handlers on WorldEvents (once; survives level resets). */
  _install() {
    if (Trader._installed) return;
    WorldEvents.on("trader_arrive", (d) => Trader._arrive(d));
    WorldEvents.on("trader_depart", (d) => Trader._depart(d));
    Trader._installed = true;
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
    Trader._recs[def.id] = rec;
    WorldEvents.schedule(
      WorldClock.absHours() + (rec.route[0].dwellH ?? 6),
      "trader_depart",
      { id: rec.id },
    );
    Trader._tryHydrate(level, rec);
    Log.info(`trader ${rec.id}: home ${rec.map}, ${rec.route.length} stops`);
  },

  /**
   * Map (re)activated: remember the live level + embody every settled trader whose current map is this one.
   */
  onActivate(level) {
    Trader._level = level;
    for (const id in Trader._recs) Trader._tryHydrate(level, Trader._recs[id]);
  },
  /**
   * Map about to suspend: dehydrate every trader embodied in it (living state → its record).
   */
  onSuspend(level) {
    for (const id in Trader._recs) {
      const rec = Trader._recs[id];
      if (rec.entId !== -1) Trader._dehydrate(level, rec);
    }
  },

  // ── event handlers (fire from WorldEvents.update, whatever map is active) ──
  _depart(d) {
    const rec = Trader._recs[d.id];
    if (rec === undefined) return;
    if (rec.entId !== -1 && Trader._level !== null)
      Trader._dehydrate(Trader._level, rec); // embodied here → pull it out first
    rec.inTransit = true;
    rec.idx = (rec.idx + 1) % rec.route.length;
    WorldEvents.schedule(WorldClock.absHours() + rec.travelH, "trader_arrive", {
      id: rec.id,
    });
    Log.info(`trader ${rec.id} departed → ${rec.route[rec.idx].map} (transit)`);
  },
  _arrive(d) {
    const rec = Trader._recs[d.id];
    if (rec === undefined) return;
    rec.inTransit = false;
    rec.map = rec.route[rec.idx].map;
    if (Trader._level !== null) Trader._tryHydrate(Trader._level, rec); // arrived where the player is?
    WorldEvents.schedule(
      WorldClock.absHours() + (rec.route[rec.idx].dwellH ?? 6),
      "trader_depart",
      { id: rec.id },
    );
    Log.info(`trader ${rec.id} arrived at ${rec.map}`);
  },

  // ── hydrate / dehydrate at the active-map boundary ──
  // Embody a settled trader IF its map is the active one and it isn't already embodied.
  _tryHydrate(level, rec) {
    if (rec.inTransit || rec.entId !== -1) return;
    if (level === null || level.mapId !== rec.map) return;
    Trader._hydrate(level, rec);
  },
  _hydrate(level, rec) {
    // near the map's player spawn (each map's own "market point" — avoids per-map authored coords)
    const sg = level.grid.worldToGrid(level.spawn.x, level.spawn.y);
    const gx = sg.x + 3;
    const gy = sg.y;
    if (rec.snap !== undefined) {
      // re-embody living state via the level manager (whole-entity restore into the active level)
      const w = level.grid.gridToWorld(gx, gy);
      rec.entId = World.levels.put(level.mapId, rec.snap, {
        [Position]: { x: w.x, y: w.y, z: 0 },
      });
    } else {
      // first time: build the vendor fresh from the descriptor (single entity path, RpgSpawn)
      rec.entId = RpgSpawn.spawnEntity(level.entities, level.grid, {
        preset: "npc",
        gx: gx,
        gy: gy,
        label: rec.name,
        nameKey: rec.name,
        merchant: rec.merchant,
      });
    }
    Log.info(`trader ${rec.id} hydrated in ${level.mapId} as ent ${rec.entId}`);
  },
  _dehydrate(level, rec) {
    if (level._tradeOpen && level._tradeMerchantId === rec.entId)
      TradeUI.close(level); // its entity is leaving — close the shop if it's open on it
    rec.snap = World.levels.take(level.mapId, rec.entId); // whole entity → held snapshot
    rec.entId = -1;
    Log.info(`trader ${rec.id} dehydrated from ${level.mapId}`);
  },

  /** New game / level teardown: drop records + queued trader events; keep the handlers. */
  reset() {
    Trader._recs = {};
    Trader._level = null;
    WorldEvents.clearKind("trader_arrive");
    WorldEvents.clearKind("trader_depart");
    Trader._install();
  },
};

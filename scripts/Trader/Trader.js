// Wandering traders — merchants that cross the map graph off-focus, driven entirely by WorldEvents.
// A static singleton (Demo); the reference consumer of WorldEvents + Universe.
//
// Off-screen a trader is NOT an entity — it's a flat RECORD tagged with a map id, advanced by discrete
// scheduled events (trader_arrive / trader_depart) on the WorldClock timeline, no per-frame sim. When
// its current map is the ACTIVE one, the record is HYDRATED into a real Merchant NPC entity (via
// RpgSpawn — so TradeUI / TradeSystem / _npcActivate treat it like any vendor); when the player leaves
// or the trader departs, it's DEHYDRATED back to the record (its living state captured as a whole-entity
// snapshot through Universe). So a trader is an entity in exactly one place — the map you're standing in.
//
// A record: { id, name, route:[{map,dwellH}], travelH, merchant, idx, level, inTransit, entId, snap }
//   route     ordered stops (map id + hours to dwell there); travelH = hours in transit between stops
//   merchant  the descriptor RpgSpawn builds the vendor from on the FIRST hydrate (stock/margins/mode)
//   level     current map when settled; inTransit true while travelling between stops
//   entId     live entity id while embodied in the active map, else -1
//   snap      whole-entity snapshot after the first dehydrate (authoritative living state thereafter)
globalThis.Trader = {
  _recs: {}, // id -> record
  _scene: null, // the active RPG scene — handlers reach the active World/map through it
  _installed: false, // WorldEvents handlers registered once

  // Register the arrive/depart handlers on WorldEvents (once; survives scene resets).
  _install() {
    if (Trader._installed) return;
    WorldEvents.on("trader_arrive", (d) => Trader._arrive(d));
    WorldEvents.on("trader_depart", (d) => Trader._depart(d));
    Trader._installed = true;
  },

  // Define a wandering trader + start its schedule. `scene` is the active scene (hydrate now if its
  // first stop is the map you're in). def: { id, name, route:[{map,dwellH}], travelH, merchant }.
  register(scene, def) {
    const rec = {
      id: def.id,
      name: def.name,
      route: def.route,
      travelH: def.travelH ?? 2,
      merchant: def.merchant,
      idx: 0,
      level: def.route[0].map,
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
    Trader._tryHydrate(scene, rec);
    Log.info(`trader ${rec.id}: home ${rec.level}, ${rec.route.length} stops`);
  },

  // Map (re)activated: remember the live scene + embody every settled trader whose current map is this one.
  onActivate(scene) {
    Trader._scene = scene;
    for (const id in Trader._recs) Trader._tryHydrate(scene, Trader._recs[id]);
  },
  // Map about to suspend: dehydrate every trader embodied in it (living state → its record).
  onSuspend(scene) {
    for (const id in Trader._recs) {
      const rec = Trader._recs[id];
      if (rec.entId !== -1) Trader._dehydrate(scene, rec);
    }
  },

  // ── event handlers (fire from WorldEvents.update, whatever map is active) ──
  _depart(d) {
    const rec = Trader._recs[d.id];
    if (rec === undefined) return;
    if (rec.entId !== -1 && Trader._scene !== null)
      Trader._dehydrate(Trader._scene, rec); // embodied here → pull it out first
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
    rec.level = rec.route[rec.idx].map;
    if (Trader._scene !== null) Trader._tryHydrate(Trader._scene, rec); // arrived where the player is?
    WorldEvents.schedule(
      WorldClock.absHours() + (rec.route[rec.idx].dwellH ?? 6),
      "trader_depart",
      { id: rec.id },
    );
    Log.info(`trader ${rec.id} arrived at ${rec.level}`);
  },

  // ── hydrate / dehydrate at the active-map boundary ──
  // Embody a settled trader IF its map is the active one and it isn't already embodied.
  _tryHydrate(scene, rec) {
    if (rec.inTransit || rec.entId !== -1) return;
    if (scene === null || scene.mapId !== rec.level) return;
    Trader._hydrate(scene, rec);
  },
  _hydrate(scene, rec) {
    // near the map's player spawn (each map's own "market point" — avoids per-map authored coords)
    const sg = scene.level.worldToGrid(scene.spawn.x, scene.spawn.y);
    const gx = sg.x + 3;
    const gy = sg.y;
    if (rec.snap !== undefined) {
      // re-embody living state via the Universe manager (whole-entity restore into the active level)
      const w = scene.level.gridToWorld(gx, gy);
      rec.entId = Universe.put(scene.mapId, rec.snap, {
        [Position]: { x: w.x, y: w.y, z: 0 },
      });
    } else {
      // first time: build the vendor fresh from the descriptor (single entity path, RpgSpawn)
      rec.entId = RpgSpawn.spawnEntity(scene.world, scene.level, {
        preset: "npc",
        gx: gx,
        gy: gy,
        label: rec.name,
        nameKey: rec.name,
        merchant: rec.merchant,
      });
    }
    Log.info(`trader ${rec.id} hydrated in ${scene.mapId} as ent ${rec.entId}`);
  },
  _dehydrate(scene, rec) {
    if (scene._tradeOpen && scene._tradeMerchantId === rec.entId)
      TradeUI.close(scene); // its entity is leaving — close the shop if it's open on it
    rec.snap = Universe.take(scene.mapId, rec.entId); // whole entity → held snapshot
    rec.entId = -1;
    Log.info(`trader ${rec.id} dehydrated from ${scene.mapId}`);
  },

  // New game / scene teardown: drop records + queued trader events; keep the handlers.
  reset() {
    Trader._recs = {};
    Trader._scene = null;
    WorldEvents.clearKind("trader_arrive");
    WorldEvents.clearKind("trader_depart");
    Trader._install();
  },
};

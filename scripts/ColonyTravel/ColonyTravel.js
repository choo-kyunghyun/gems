// Map ARRIVAL for the colony scene — world-map travel, the squad's crossing, and the two ways
// into a map. Free functions over the scene (composition; GMRT has no usable class inheritance).
/**
 * Visited maps stay ALIVE in the World level pool — data and runtime both on the Level
 * (ColonyMap) — so a trip never destroys/rebuilds. Only the SQUAD migrates: every entity sharing
 * the player's Squad id (player included) moves as a WHOLE entity through World.take/put — a trip
 * forces a "wait" member back to "follow" first, so the squad always travels together. Travel is
 * by WORLD MAP (travel(), below): the squad deploys from a site's beacon to any other site
 * (contentSites), the crossing costing in-game hours. There is no per-map player and no carried
 * component subset; kicked/unhired companions are plain map residents. Everything is persistent
 * for the session: a map builds from its data exactly ONCE (first visit), then only
 * freezes/thaws — no eviction, cold serialize, or respawn-from-file reconcile.
 *
 * Two ways into a map: build() is the FIRST visit — ColonyMap.build lays the site down (the seed,
 * the generator, the painter, the spawn pass) and the squad lands on it; resume() is a pooled
 * level — parked earlier, or restored from a save (ColonyMap.restoreLevel pools a saved map's
 * data at load, its presentation built on its first visit). go() picks between them. Either way
 * the presentation is ColonyView's, built once per level, and every arrival ends in _arrive.
 *
 * Contract: the scene owns `level`, `playerId`, `build`, `nearNpc` and `window`; this engine
 * writes them on arrival and reads nothing else of it.
 */
globalThis.ColonyTravel = {
  // Hours a trip across one whole world-map chart unit takes — the travelHours scale (corner to
  // corner is ~1.4 units).
  HOURS_PER_CHART: 20,

  /**
   * Take the SQUAD to another map: every member (player FIRST) leaves the current world as a
   * whole entity via World.take, the map parks, and the members land in the target via
   * World.put with entry-position overrides (_arriveSquad). "wait" is map-local — the trip
   * forces it back to "follow" (re-applying its carry bonus) so the squad always travels
   * together; only kicked/unhired companions stay behind. Called from create() + travel().
   */
  go(scene, mapId, entryId) {
    let squad = null; // whole-entity snapshots, player first; null = boot (spawn a fresh player)
    // ── PHASE A: pull the squad out, then park the current map (its level stays pooled) ──
    if (scene.playerId !== undefined) {
      const sid = scene.level.entities.get(scene.playerId, Squad).id;
      const members = Companions.members(
        scene.level.entities,
        sid,
        scene.playerId,
      );
      squad = [];
      for (let i = 0; i < members.length; i++) {
        // no member opts out of travel: a "wait" companion snaps back to follow (+carry bonus);
        // the player leads the list and is no Follower
        if (members[i] !== scene.playerId)
          Companions.setState(
            scene.level.entities,
            scene.playerId,
            members[i],
            "follow",
          );
        squad.push(World.take(scene.level.id, members[i]));
      }
      Trader.onSuspend(scene.level); // dehydrate any embodied wandering trader → its record (before park)
      scene.level.entities.flush(); // commit the taken members' removals before parking
      ColonyTravel.suspend(scene);
    }
    // ── PHASE B: enter the target — a pooled level resumes (parked, or restored from a save
    // and never visited), anything else builds from its site ──
    if (World.get(mapId) !== null) ColonyTravel.resume(scene, mapId, entryId, squad);
    else ColonyTravel.build(scene, mapId, entryId, squad);
    Trader.onActivate(scene.level); // embody any trader currently in this map
  },

  /**
   * Land the traveling squad at the entry: the player (squad[0]) first — scene.playerId
   * re-latches to its new id — then companions staggered beside it. Whole-entity restore
   * (World.put), so Appearance/Equipment/Stats arrive intact with no re-derive.
   */
  _arriveSquad(scene, squad, sp) {
    if (squad === null || squad.length === 0) return;
    scene.playerId = World.put(scene.level.id, squad[0], {
      [Position]: { x: sp.x, y: sp.y, z: 0 },
      [Velocity]: { x: 0, y: 0, z: 0 },
    });
    for (let i = 1; i < squad.length; i++)
      World.put(scene.level.id, squad[i], {
        [Position]: { x: sp.x - 24 - i * 22, y: sp.y + 24, z: 0 },
        [Velocity]: { x: 0, y: 0, z: 0 },
      });
  },

  /**
   * The player is whoever the store holds — spawned with a fresh map on boot, restored with a
   * saved one on the load boot, just landed on a trip (re-latched per frame from the same query
   * thereafter — sceneColony.update).
   */
  _latch(scene) {
    const pid = scene.level.entities.first(Playable);
    scene.playerId = pid !== -1 ? pid : undefined;
  },

  /**
   * Park the live map: its Level stays in the pool untouched, runtime and all. Unassign (not
   * destroy) the camera's view — the parked map keeps it for resume; without the unassign its
   * later teardown would tear down the live view.
   */
  suspend(scene) {
    CameraSystem.view(scene.level).release();
    PuppetSystem.park(scene.level); // its mirrors leave the room-global queries
  },

  /**
   * Enter a map for the FIRST time: ColonyMap builds and pools it (spawning the player only on
   * boot — `squad` null), the traveling squad lands at its entry, the presentation comes up, and
   * the arrival applies.
   */
  build(scene, mapId, entryId, squad) {
    const level = ColonyMap.build(mapId, entryId, squad === null);
    scene.level = level;
    World.activeId = level.id; // building a map activates it (the id may have fallen back)
    ColonyTravel._arriveSquad(scene, squad, ColonyMap.of(level).spawn); // already entry-resolved
    ColonyTravel._latch(scene);
    ColonyView.activate(level);
    ColonyTravel._arrive(scene);
  },

  /**
   * Resume a pooled level: point the scene at it, land the traveling squad at the entry (a
   * parked store has no player — the squad left on a trip; a restored one holds its saved
   * player), then re-claim the viewport — or, on a saved map's first visit since the load, build
   * its presentation here, exactly as build() does.
   */
  resume(scene, mapId, entryId, squad) {
    const level = World.get(mapId); // the pooled data, exactly as it parked (or loaded)
    scene.level = level;
    World.activeId = mapId;
    PuppetSystem.thaw(level); // activates every mirror in the room, so the other pooled maps park again
    const pooled = World.ids();
    for (let i = 0; i < pooled.length; i++) {
      if (pooled[i] !== mapId) PuppetSystem.park(World.get(pooled[i]));
    }
    const data = ColonyMap.of(level);
    const rt = ColonyMap.runtime(level);

    const sp = data.entries[entryId] ?? data.spawn;
    ColonyTravel._arriveSquad(scene, squad, sp);
    ColonyTravel._latch(scene);

    if (rt.renderer === undefined) ColonyView.activate(level);
    else {
      CameraSystem.view(level).assign(0);
      // snap the camera's look-at to the entry so it doesn't pan from the parked position (the
      // TARGET needs no re-aim: the arrived player carries CameraFocus — take/put re-mints its
      // id, but the follow policy resolves the marker by live query each update)
      const entities = level.entities;
      const cp = entities.require(entities.first(Camera), Position);
      cp.x = sp.x;
      cp.y = sp.y;
    }
    ColonyTravel._arrive(scene);
  },

  /**
   * The map's ambient bed: interiors (meta.indoor) the cozy loop, the open world the tense one —
   * what plays whenever the player's Radio is off (its `ambient` hook is wired to this).
   */
  bed(level) {
    const indoor = level.entities.get(level.self, ColonyMap.INDOOR) === true;
    return indoor ? musAmbientCozy : musAmbientTense;
  },

  /**
   * Cross-fade to the map's bed on every arrival — unless the Radio is tuned: its station plays
   * through arrivals, the bed returning when the dial goes off (Radio.off). Music.play treats a
   * same-track re-request as a no-op, so this is safe to call unconditionally.
   */
  _applyBgm(scene) {
    if (Radio.on()) return;
    Music.play(ColonyTravel.bed(scene.level));
  },

  /**
   * The map's climate (meta.climate — a forced sky condition + Kelvin offset, whole-map) or the
   * open sky when it has none. Called on every arrival like _applyBgm; Weather cross-fades either way.
   */
  _applyClimate(scene) {
    const level = scene.level;
    Weather.setClimate(level.entities.get(level.self, ColonyMap.CLIMATE));
  },

  /**
   * Every arrival (build + resume): the scene's per-map transients reset — kept off the level so a
   * resume can't restore a stale one — the map's bed and sky, and the world-space effects of the
   * previous map dropped (their coordinates are map-local).
   */
  _arrive(scene) {
    scene.build.armed = false;
    scene.build.active = false;
    scene.nearNpc = false;
    scene.window.dirty = true; // the bag, if it shows, re-reads this map's squad + store
    ColonyTravel._applyBgm(scene);
    ColonyTravel._applyClimate(scene);
    FloatingText.clear();
    ParticleFx.clear();
    WorldOverlay.clearTracers();
  },

  /**
   * The world-map trip (WorldMapUI's Travel): the crossing's in-game hours pass on the world
   * timeline FIRST — the clock and the sky roll on, so a due WorldEvent (a trader's leg) fires on
   * arrival — then the squad lands at the site's default entry through go(). A same-site request
   * is a no-op.
   */
  travel(scene, siteId) {
    if (siteId === scene.level.id) return;
    const hours = ColonyTravel.travelHours(scene.level.id, siteId);
    const secs = (hours / 24) * WorldClock.dayLength;
    WorldClock.update(secs);
    Weather.update(secs);
    Log.info(`travel → ${siteId} (${hours} h)`);
    ColonyTravel.go(scene, siteId, "default");
  },

  /**
   * In-game hours a trip takes: the two sites' chart distance (contentSites `pos`, in [0,1]
   * chart space) × HOURS_PER_CHART, at least 1. An endpoint that is no site reads 1.
   */
  travelHours(fromId, toId) {
    const a = contentSites.get(fromId);
    const b = contentSites.get(toId);
    if (a === undefined || b === undefined) return 1;
    const dx = a.pos.x - b.pos.x;
    const dy = a.pos.y - b.pos.y;
    return Math.max(
      1,
      Math.round(Math.sqrt(dx * dx + dy * dy) * ColonyTravel.HOURS_PER_CHART),
    );
  },
};

/**
 * Map arrival for the colony scene.
 *
 * A departure parks a persistent map in the level pool, to resume untouched, and frees any other
 * with everything left on it, so its next visit builds it afresh. Only the squad migrates, each
 * member as a whole entity; a "wait" member is forced back to "follow" so the squad always travels
 * together, and kicked/unhired companions stay as map residents. A crossing costs in-game hours by
 * chart distance.
 *
 * Contract: the scene owns `world`, `level`, `playerId`, `stages` (map id → its ColonyStage),
 * `build`, `nearNpc`, `window` and `tickWorld(dt)`; this engine pools through `world`, spends a
 * crossing's hours through `tickWorld`, writes the rest on arrival and reads nothing else of it.
 */
globalThis.ColonyTravel = {
  // in-game hours per world-map chart unit (corner to corner is ~1.4 units)
  HOURS_PER_CHART: 20,

  /**
   * Take the squad to another map, parking the current one; a pooled target resumes, any other
   * builds from its site. "wait" is map-local, so the trip forces every companion to "follow".
   */
  go(scene, mapId, entryId) {
    let squad = null; // whole-entity snapshots, player first; null on boot spawns a fresh player
    if (scene.playerId !== undefined) {
      const sid = scene.level.entities.get(scene.playerId, Squad).id;
      const members = Companions.members(
        scene.level.entities,
        sid,
        scene.playerId,
      );
      squad = [];
      for (let i = 0; i < members.length; i++) {
        // the player leads the list and is no follower
        if (members[i] !== scene.playerId)
          Companions.setState(
            scene.level.entities,
            scene.playerId,
            members[i],
            "follow",
          );
        squad.push(scene.world.take(scene.level.id, members[i]));
      }
      scene.level.entities.flush(); // commit the taken members' removals before parking
      if (ColonyMap.persistent(scene.level)) ColonyTravel.suspend(scene);
      else ColonyTravel._free(scene);
    }
    if (scene.world.get(mapId) !== null) ColonyTravel.resume(scene, mapId, entryId, squad);
    else ColonyTravel.build(scene, mapId, entryId, squad);
  },

  /**
   * Land the squad at the entry, the player first (re-latching `playerId` to its new id), then
   * companions staggered beside it. Members arrive whole, with nothing re-derived.
   */
  _arriveSquad(scene, squad, sp) {
    if (squad === null || squad.length === 0) return;
    scene.playerId = scene.world.put(scene.level.id, squad[0], {
      [Position]: { x: sp.x, y: sp.y, z: 0 },
      [Velocity]: { x: 0, y: 0, z: 0 },
    });
    for (let i = 1; i < squad.length; i++)
      scene.world.put(scene.level.id, squad[i], {
        [Position]: { x: sp.x - 24 - i * 22, y: sp.y + 24, z: 0 },
        [Velocity]: { x: 0, y: 0, z: 0 },
      });
  },

  /** The player is whoever the store holds, however it got there. */
  _latch(scene) {
    const pid = scene.level.entities.first(Playable);
    scene.playerId = pid !== -1 ? pid : undefined;
  },

  /**
   * Park the live map: its level stays in the pool untouched, runtime and all. The camera view is
   * released, not destroyed — the parked map keeps it for resume, and its later teardown must not
   * tear down the live view.
   */
  suspend(scene) {
    CameraSystem.view(scene.level).release();
    PuppetSystem.park(scene.level); // its mirrors leave the room-global queries
  },

  /**
   * Free the live transient map. Never parked on the way: a parked instance outlives its free
   * (docs/GMRT.md).
   */
  _free(scene) {
    const level = scene.level;
    CameraSystem.view(level).release();
    scene.stages[level.id].renderer.destroy();
    delete scene.stages[level.id];
    scene.world.remove(level.id);
    Log.info(`colony map: ${level.id} [freed]`);
  },

  /** Enter a map not pooled; a null `squad` (boot) spawns the player with it. */
  build(scene, mapId, entryId, squad) {
    const level = ColonyMap.build(scene.world, mapId, entryId, squad === null);
    scene.level = level; // its id may have fallen back from the one asked for
    ColonyTravel._arriveSquad(scene, squad, ColonyMap.of(level).spawn); // already entry-resolved
    ColonyTravel._latch(scene);
    scene.stages[level.id] = ColonyView.stage(level);
    ColonyTravel._arrive(scene);
  },

  /**
   * Resume a pooled level — parked earlier, or restored from a save and not yet staged, in which
   * case its stage is built here as on a first visit.
   */
  resume(scene, mapId, entryId, squad) {
    const level = scene.world.get(mapId);
    scene.level = level;
    PuppetSystem.thaw(level); // activates every mirror in the room, so the other pooled maps park again
    const pooled = scene.world.ids();
    for (let i = 0; i < pooled.length; i++) {
      if (pooled[i] !== mapId) PuppetSystem.park(scene.world.get(pooled[i]));
    }
    const data = ColonyMap.of(level);
    const sp = data.entries[entryId] ?? data.spawn;
    ColonyTravel._arriveSquad(scene, squad, sp);
    ColonyTravel._latch(scene);

    if (scene.stages[mapId] === undefined) scene.stages[mapId] = ColonyView.stage(level);
    else CameraSystem.view(level).assign(0);
    // snap the look-at to the player so it doesn't pan in from where the map was left — a restored
    // player stands where it was saved, not at the entry; the target needs no re-aim, as the
    // player carries its focus marker
    const entities = level.entities;
    const cp = entities.require(entities.first(Camera), Position);
    const pp = scene.playerId !== undefined ? entities.get(scene.playerId, Position) : undefined;
    cp.x = pp !== undefined ? pp.x : sp.x;
    cp.y = pp !== undefined ? pp.y : sp.y;
    ColonyTravel._arrive(scene);
  },

  /** The map's ambient bed, playing whenever the radio is off. */
  bed(level) {
    const indoor = level.entities.get(level.self, ColonyMap.INDOOR) === true;
    return indoor ? musAmbientCozy : musAmbientTense;
  },

  /** Cross-fade to the map's bed on arrival, unless a radio station plays through it. */
  _applyBgm(scene) {
    if (Radio.on()) return;
    Music.play(ColonyTravel.bed(scene.level));
  },

  /** The map's climate, or the open sky when it has none. */
  _applyClimate(scene) {
    const level = scene.level;
    Weather.setClimate(level.entities.get(level.self, ColonyMap.CLIMATE));
  },

  /**
   * Every arrival resets the scene's per-map transients — kept off the level so a resume can't
   * restore a stale one — and drops the previous map's world-space effects (map-local coordinates).
   */
  _arrive(scene) {
    scene.build.armed = false;
    scene.build.active = false;
    scene.nearNpc = false;
    scene.window.dirty = true;
    ColonyTravel._applyBgm(scene);
    ColonyTravel._applyClimate(scene);
    FloatingText.clear();
    ParticleFx.clear();
    WorldOverlay.clearTracers();
  },

  /**
   * The world-map trip: the crossing's hours pass first, the events due in them firing on the way,
   * then the squad lands at the site's default entry. A same-site request is a no-op.
   */
  travel(scene, siteId) {
    if (siteId === scene.level.id) return;
    const hours = ColonyTravel.travelHours(scene.level.id, siteId);
    const secs = (hours / 24) * WorldClock.dayLength;
    scene.tickWorld(secs);
    Log.info(`travel → ${siteId} (${hours} h)`);
    ColonyTravel.go(scene, siteId, "default");
  },

  /** In-game hours a trip takes by chart distance, at least 1; an unknown endpoint reads 1. */

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

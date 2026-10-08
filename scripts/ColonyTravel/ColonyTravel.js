/**
 * Map arrival for the colony scene.
 *
 * A departure parks a persistent map in the level pool, to resume untouched, and frees any other
 * with everything left on it, so its next visit builds it afresh. Only the squad migrates, each
 * member as a whole entity; a "wait" member is forced back to "follow" so the squad always travels
 * together, and kicked/unhired companions stay as map residents. A crossing costs in-game hours by
 * chart distance.
 *
 * Contract: the scene owns `world`, `level`, `playerId`, `tickWorld(dt)` and `arrive()`; this
 * engine pools through `world`, spends a crossing's hours through `tickWorld`, writes the rest on
 * arrival, then calls `arrive()` for what the scene resets per map, and reads nothing else of it.
 */
globalThis.ColonyTravel = {
  // in-game hours per world-map chart unit (corner to corner is ~1.4 units)
  HOURS_PER_CHART: 20,
  // world px a companion lands behind and below the entry, each further one a step further back
  LAND_X: 24,
  LAND_Y: 24,
  LAND_STEP: 22,

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
        // a seat names a carrier of this map alone
        Ride.release(scene.level.entities, members[i]);
        squad.push(scene.world.take(scene.level.id, members[i]));
      }
      scene.level.entities.flush(); // commit the taken members' removals before parking
      if (ColonyMap.persistent(scene.level)) Maps.park(scene.level);
      else ColonyTravel._free(scene);
    }
    if (scene.world.get(mapId) !== null) ColonyTravel.resume(scene, mapId, entryId, squad);
    else ColonyTravel.build(scene, mapId, entryId, squad);
  },

  /**
   * Land the squad at the entry, the player first, then companions staggered beside it. Members
   * arrive whole, with nothing re-derived.
   */
  _arriveSquad(scene, squad, sp) {
    if (squad === null || squad.length === 0) return;
    scene.world.put(scene.level.id, squad[0], {
      [Position]: { x: sp.x, y: sp.y, z: 0 },
      [Velocity]: { x: 0, y: 0, z: 0 },
    });
    for (let i = 1; i < squad.length; i++)
      scene.world.put(scene.level.id, squad[i], {
        [Position]: {
          x: sp.x - ColonyTravel.LAND_X - i * ColonyTravel.LAND_STEP,
          y: sp.y + ColonyTravel.LAND_Y,
          z: 0,
        },
        [Velocity]: { x: 0, y: 0, z: 0 },
      });
  },

  /** The player is whoever the store holds, however it got there. */
  _latch(scene) {
    const pid = ColonyPlayer.id(scene.level.entities);
    scene.playerId = pid !== -1 ? pid : undefined;
  },

  /** Free the live transient map, stage and all. */
  _free(scene) {
    const id = scene.level.id;
    scene.world.remove(id);
    Log.info(`colony map: ${id} [freed]`);
  },

  /**
   * Enter a map not pooled; a null `squad` (boot) spawns the player with it. A map that fails to
   * build sends the squad home instead, resumed when the home is pooled, so no map is ever built
   * over its pooled self.
   */
  build(scene, mapId, entryId, squad) {
    const level = ColonyMap.build(scene.world, mapId, entryId, squad === null);
    if (level === null) {
      const home = ColonyLevel.START;
      if (mapId === home) throw new Error(`ColonyTravel: the home map "${home}" failed to build`);
      if (scene.world.get(home) !== null) ColonyTravel.resume(scene, home, "default", squad);
      else ColonyTravel.build(scene, home, "default", squad);
      return;
    }
    ColonyTravel._enter(scene, level, ColonyMap.of(level).spawn, squad); // already entry-resolved
  },

  /** The map's climate takes over; then the scene resets its own. */
  _land(scene) {
    const level = scene.level;
    Weather.setClimate(ColonyMap.biome(level).climate);
    scene.arrive();
  },

  /** Resume a pooled level — parked earlier, or restored from a save and not yet entered. */
  resume(scene, mapId, entryId, squad) {
    const level = scene.world.get(mapId);
    const data = ColonyMap.of(level);
    ColonyTravel._enter(scene, level, data.entries[entryId] ?? data.spawn, squad);
  },

  /**
   * Make a pooled level the live map, its camera and stage set up on its first entry, and land
   * the squad at `sp`.
   */
  _enter(scene, level, sp, squad) {
    ColonyView.camera(level);
    ColonyView.stage(level);
    scene.level = Maps.enter(scene.world, level.id);
    ColonyTravel._arriveSquad(scene, squad, sp);
    ColonyTravel._latch(scene);
    // snap the look-at to the player so it doesn't pan in from where the map was left — a restored
    // player stands where it was saved, not at the entry; the target needs no re-aim, as the
    // player carries its focus marker
    const entities = level.entities;
    const cp = entities.require(entities.first(Camera), Position);
    const pp = scene.playerId !== undefined ? entities.get(scene.playerId, Position) : undefined;
    cp.x = pp !== undefined ? pp.x : sp.x;
    cp.y = pp !== undefined ? pp.y : sp.y;
    ColonyTravel._land(scene);
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

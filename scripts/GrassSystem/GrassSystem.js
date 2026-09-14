/**
 * The grass ECONOMY of a level — the grass ground as a live resource: it creeps back over open
 * soil and is consumed back to soil, all as terrain cell EDITS. No entity per cell: the state
 * IS the terrain layer (already in every save), and RenderGrass redraws whatever the layer
 * says, so the whole system is cell writes + one batched rebuild. FloraSystem's clock pattern:
 * in-game hours off a Records record — a parked map's clock stops, and the first tick after
 * a long absence spans it whole (bounded below, so a season away can't buy a runaway sweep).
 *
 * Creep: SPREAD_RATE rolls per in-game hour. A roll picks a random cell and turns it grass
 * when it is the HOST material, touches grass on a 4-neighbour (the creep front — random cells
 * make growth proportional to the front's length), and is UNOCCUPIED — no build layer, no
 * built entity (the placement side of the same rule: BuildMode.applyItem cuts the grass under
 * whatever it places, and clearBuilt() sweeps a freshly built map's prefab tiles once). The
 * creep stops at CAP_SHARE of the map's cells, so the biome's other bands survive.
 *
 * Consumption: cut(scene, gx, gy) reverts one grass cell to HOST and reports whether it did —
 * the caller owns the yield (a harvest job, a grazer). Overcut ground regrows only from the
 * front, so a field cut to the root stays bald: depletion is real (the fauna carrying-capacity
 * groundwork — WORLD's "남획은 고갈로 돌아온다").
 *
 * Renders: every edit marks the level's terrain passes + grass pass dirty (a flag on the pass —
 * RenderTileMap.markDirty), so however many edits a frame makes, each pass rebuilds once.
 * Takes the level (its runtime's layers and passes — ColonyMap — and its clock record).
 */
globalThis.GrassSystem = {
  KEY: "grassland", // its Records clock key — a data key (a save holds it)
  SPREAD_RATE: 6, // expected creep rolls per in-game hour
  MAX_ROLLS: 2000, // one update's roll bound — a long-parked map creeps, not floods
  CAP_SHARE: 0.5, // the creep stops at this share of the map's cells
  HOST: "soil", // the material grass creeps into — and what a cut cell reverts to

  /**
   * Creep the level up to now (WorldClock.absHours). Cheap when under an hour has passed; a
   * first call starts the map's clock.
   */
  update(level) {
    const now = WorldClock.absHours();
    const rec = level.meta.get(GrassSystem.KEY);
    if (rec === undefined) {
      level.meta.set(GrassSystem.KEY, { lastHour: now });
    } else if (now - rec.lastHour >= 1) {
      const hours = now - rec.lastHour;
      rec.lastHour = now;
      GrassSystem._creep(level, hours);
    }
  },

  /**
   * Consume one grass cell back to HOST. True when a grass cell reverted — the caller owns
   * the yield; false on any other ground (a double cut is a miss, not an error).
   */
  cut(level, gx, gy) {
    const grass = GrassSystem._type(level, "grass");
    const host = GrassSystem._type(level, GrassSystem.HOST);
    if (grass === undefined || host === undefined) return false;
    const layer = ColonyMap.runtime(level).terrainLayer;
    if (layer.get(gx, gy) !== grass) return false;
    layer.set(gx, gy, host);
    GrassSystem._mark(level);
    return true;
  },

  /** The map's TileType for a contentBiomes material id, off the runtime's terrainMats; undefined off-palette. */
  _type(level, material) {
    const mats = ColonyMap.runtime(level).terrainMats;
    if (mats === undefined) return undefined;
    for (let i = 0; i < mats.length; i++)
      if (mats[i].material === material) return mats[i].type;
    return undefined;
  },

  /** the hours' creep rolls — see the header; a map whose palette lacks grass or HOST no-ops */
  _creep(level, hours) {
    const grass = GrassSystem._type(level, "grass");
    const host = GrassSystem._type(level, GrassSystem.HOST);
    if (grass === undefined || host === undefined) return;
    const grid = level.grid;
    const rt = ColonyMap.runtime(level);
    const builtEnts = BuildMode.of(level).builtEnts;
    const layer = rt.terrainLayer;
    const cap = Math.floor(grid.cols * grid.rows * GrassSystem.CAP_SHARE);
    let count = 0;
    for (let gy = 0; gy < grid.rows; gy++)
      for (let gx = 0; gx < grid.cols; gx++)
        if (layer.get(gx, gy) === grass) count++;
    if (count === 0) return; // no front to creep from
    const want = hours * GrassSystem.SPREAD_RATE;
    let rolls = Math.min(Math.floor(want), GrassSystem.MAX_ROLLS);
    if (rolls < GrassSystem.MAX_ROLLS && random(1) < want - Math.floor(want))
      rolls++;
    const lkeys = contentBuild.tileLayers();
    let grew = false;
    for (let i = 0; i < rolls; i++) {
      if (count >= cap) break;
      const gx = irandom(grid.cols - 1);
      const gy = irandom(grid.rows - 1);
      if (layer.get(gx, gy) !== host) continue;
      const front =
        layer.get(gx - 1, gy) === grass ||
        layer.get(gx + 1, gy) === grass ||
        layer.get(gx, gy - 1) === grass ||
        layer.get(gx, gy + 1) === grass;
      if (!front) continue;
      let covered = builtEnts[gx + "," + gy] !== undefined;
      for (let k = 0; k < lkeys.length; k++)
        if (TileEdit.occupied(rt[lkeys[k] + "Layer"], gx, gy)) covered = true;
      if (covered) continue;
      layer.set(gx, gy, grass);
      count++;
      grew = true;
    }
    if (grew) GrassSystem._mark(level);
  },

  /**
   * One build-time sweep: every cell a build layer occupies loses its grass (a generated
   * prefab's walls and floors — the runtime side is BuildMode's cut on placement). Called by
   * ColonyMap._buildRenderer BEFORE the passes exist, so the initial VBOs already see the
   * result — there is nothing to mark yet.
   */
  clearBuilt(level) {
    const grass = GrassSystem._type(level, "grass");
    const host = GrassSystem._type(level, GrassSystem.HOST);
    if (grass === undefined || host === undefined) return;
    const grid = level.grid;
    const rt = ColonyMap.runtime(level);
    const layer = rt.terrainLayer;
    const lkeys = contentBuild.tileLayers();
    for (let gy = 0; gy < grid.rows; gy++)
      for (let gx = 0; gx < grid.cols; gx++) {
        if (layer.get(gx, gy) !== grass) continue;
        for (let k = 0; k < lkeys.length; k++)
          if (TileEdit.occupied(rt[lkeys[k] + "Layer"], gx, gy)) {
            layer.set(gx, gy, host);
            break;
          }
      }
  },

  /** the ground changed: the terrain stack + the grass pass rebuild on their next draw */
  _mark(level) {
    const rt = ColonyMap.runtime(level);
    for (let i = 0; i < rt.terrainPasses.length; i++)
      rt.terrainPasses[i].markDirty();
    if (rt.grassPass !== undefined) rt.grassPass.markDirty();
  },
};

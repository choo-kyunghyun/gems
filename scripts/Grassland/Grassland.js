/**
 * The grass ground as a live resource, as terrain cell EDITS: `cut` consumes one grass cell back
 * to HOST and reports whether it did — the caller owns the yield (a harvest job, a grazer; the
 * placement side is BuildMode.applyItem cutting the grass under whatever it places) — and
 * `clearBuilt` sweeps a freshly built map's prefab tiles once. Overcut ground regrows only from
 * the front (GrassSystem's creep), so a field cut to the root stays bald: depletion is real (the
 * fauna carrying-capacity groundwork — WORLD's "남획은 고갈로 돌아온다"). No entity per cell:
 * the state IS the terrain layer (already in every save), and RenderGrass redraws whatever the
 * layer says, so every edit is a cell write plus `mark`, one batched rebuild of the terrain
 * passes + the grass pass (RenderTileMap.markDirty — however many edits a frame makes, each
 * pass rebuilds once). Takes the level (its runtime's layers and passes — ColonyMap).
 */
globalThis.Grassland = {
  HOST: "soil", // the material grass creeps into — and what a cut cell reverts to

  /**
   * Consume one grass cell back to HOST. True when a grass cell reverted — the caller owns
   * the yield; false on any other ground (a double cut is a miss, not an error).
   */
  cut(level, gx, gy) {
    const grass = Grassland.type(level, "grass");
    const host = Grassland.type(level, Grassland.HOST);
    if (grass === undefined || host === undefined) return false;
    const layer = ColonyMap.runtime(level).terrainLayer;
    if (layer.get(gx, gy) !== grass) return false;
    layer.set(gx, gy, host);
    Grassland.mark(level);
    return true;
  },

  /**
   * One build-time sweep: every cell a build layer occupies loses its grass (a generated
   * prefab's walls and floors — the runtime side is BuildMode's cut on placement). Called by
   * ColonyView._renderer BEFORE the passes exist, so the initial VBOs already see the
   * result — there is nothing to mark yet.
   */
  clearBuilt(level) {
    const grass = Grassland.type(level, "grass");
    const host = Grassland.type(level, Grassland.HOST);
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

  /** The map's TileType for a contentBiomes material id, off the runtime's terrainMats; undefined off-palette. */
  type(level, material) {
    const mats = ColonyMap.runtime(level).terrainMats;
    if (mats === undefined) return undefined;
    for (let i = 0; i < mats.length; i++)
      if (mats[i].material === material) return mats[i].type;
    return undefined;
  },

  /** the ground changed: the terrain stack + the grass pass rebuild on their next draw */
  mark(level) {
    const rt = ColonyMap.runtime(level);
    for (let i = 0; i < rt.terrainPasses.length; i++)
      rt.terrainPasses[i].markDirty();
    if (rt.grassPass !== undefined) rt.grassPass.markDirty();
  },
};

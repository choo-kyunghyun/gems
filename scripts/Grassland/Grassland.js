/**
 * The grass ground as a live resource, edited as terrain cells. Grass regrows only from the
 * front of a field, so ground cut to the root stays bald: depletion is real. There is no entity
 * per cell; the state is the terrain layer, so every edit is a cell write.
 */
globalThis.Grassland = {
  HOST: "soil", // the material grass creeps into — and what a cut cell reverts to

  /**
   * True when a grass cell reverted to HOST; the caller owns the yield. A double cut is a miss,
   * not an error.
   */
  cut(level, gx, gy) {
    const grass = Grassland.type(level, "grass");
    const host = Grassland.type(level, Grassland.HOST);
    if (grass === undefined || host === undefined) return false;
    const layer = ColonyMap.runtime(level).terrainLayer;
    if (layer.get(gx, gy) !== grass) return false;
    layer.set(gx, gy, host);
    return true;
  },

  /** One build-time sweep clearing the grass under every built cell. */
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
          if (rt[lkeys[k] + "Layer"].occupied(gx, gy)) {
            layer.set(gx, gy, host);
            break;
          }
      }
  },

  /** The map's TileType for a material id; undefined off-palette. */
  type(level, material) {
    const mats = ColonyMap.runtime(level).terrainMats;
    if (mats === undefined) return undefined;
    for (let i = 0; i < mats.length; i++)
      if (mats[i].material === material) return mats[i].type;
    return undefined;
  },
};

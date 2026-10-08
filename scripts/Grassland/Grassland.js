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
    const layer = level.grid.layer("terrain");
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
    const layer = grid.layer("terrain");
    const built = Grassland.built(grid);
    for (let gy = 0; gy < grid.rows; gy++)
      for (let gx = 0; gx < grid.cols; gx++) {
        if (layer.get(gx, gy) !== grass) continue;
        for (let k = 0; k < built.length; k++)
          if (built[k].occupied(gx, gy)) {
            layer.set(gx, gy, host);
            break;
          }
      }
  },

  /** The map's TileType for a material id; undefined off-palette. */
  type(level, material) {
    return level.grid.layer("terrain").type(material);
  },

  /** The grid's layers a build edits — what covers the ground. */
  built(grid) {
    const lkeys = contentBuild.tileLayers();
    const out = [];
    for (let i = 0; i < lkeys.length; i++) out.push(grid.layer(lkeys[i]));
    return out;
  },
};

/**
 * The grass creep of a level: grass growing back over open soil, clocked in in-game hours on a
 * whole-map record. A parked map's clock stops, and the first tick after a long absence spans it
 * whole, bounded so a long absence can't buy a runaway sweep.
 *
 * A roll picks a random cell and turns it grass when it is the host material, touches grass on a
 * 4-neighbour, and is unoccupied. Random cells make growth proportional to the front's length.
 * The creep stops at CAP_SHARE of the map's cells, so the biome's other bands survive.
 */
globalThis.GrassSystem = {
  KEY: "grassland", // saved
  SPREAD_RATE: 6, // expected rolls per in-game hour
  MAX_ROLLS: 2000, // per update — a long-parked map creeps, not floods
  CAP_SHARE: 0.5,

  /** Cheap when under an hour has passed; the first call starts the map's clock. */
  update(level) {
    const rec = level.entities.of(level.self, GrassSystem.KEY, () => ({
      lastHour: WorldClock.absHours(),
    }));
    const hours = WorldClock.catchUp(rec, 1);
    if (hours > 0) GrassSystem._creep(level, hours);
  },

  /** A no-op on a map whose palette lacks grass or the host material. */
  _creep(level, hours) {
    const grass = Grassland.type(level, "grass");
    const host = Grassland.type(level, Grassland.HOST);
    if (grass === undefined || host === undefined) return;
    const grid = level.grid;
    const rt = ColonyMap.runtime(level);
    const builtEnts = Build.of(level).builtEnts;
    const layer = rt.terrainLayer;
    const cap = Math.floor(grid.cols * grid.rows * GrassSystem.CAP_SHARE);
    let count = 0;
    for (let gy = 0; gy < grid.rows; gy++)
      for (let gx = 0; gx < grid.cols; gx++)
        if (layer.get(gx, gy) === grass) count++;
    if (count === 0) return;
    const want = hours * GrassSystem.SPREAD_RATE;
    let rolls = Math.min(Math.floor(want), GrassSystem.MAX_ROLLS);
    if (rolls < GrassSystem.MAX_ROLLS && random(1) < want - Math.floor(want))
      rolls++;
    const lkeys = contentBuild.tileLayers();
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
        if (rt[lkeys[k] + "Layer"].occupied(gx, gy)) covered = true;
      if (covered) continue;
      layer.set(gx, gy, grass);
      count++;
    }
  },
};

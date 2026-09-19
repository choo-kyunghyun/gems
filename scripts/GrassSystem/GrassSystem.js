/**
 * The grass creep of a level — the grass ground growing back over open soil, on FloraSystem's
 * clock pattern: in-game hours off a whole-map record — a parked map's clock stops, and the first
 * tick after a long absence spans it whole (bounded below, so a season away can't buy a runaway
 * sweep). The consumption side (cut, the built sweep) and the cell edit itself are Grassland's.
 *
 * Creep: SPREAD_RATE rolls per in-game hour. A roll picks a random cell and turns it grass
 * when it is the HOST material, touches grass on a 4-neighbour (the creep front — random cells
 * make growth proportional to the front's length), and is UNOCCUPIED — no build layer, no
 * built entity. The creep stops at CAP_SHARE of the map's cells, so the biome's other bands
 * survive. Takes the level (its runtime's layers — ColonyMap — and its clock record).
 */
globalThis.GrassSystem = {
  KEY: "grassland", // its clock's token on the level's own entity — a data key (a save holds it)
  SPREAD_RATE: 6, // expected creep rolls per in-game hour
  MAX_ROLLS: 2000, // one update's roll bound — a long-parked map creeps, not floods
  CAP_SHARE: 0.5, // the creep stops at this share of the map's cells

  /**
   * Creep the level up to now (WorldClock.absHours). Cheap when under an hour has passed; a
   * first call starts the map's clock.
   */
  update(level) {
    const now = WorldClock.absHours();
    const rec = level.entities.of(level.self, GrassSystem.KEY, () => ({ lastHour: now }));
    if (now - rec.lastHour >= 1) {
      const hours = now - rec.lastHour;
      rec.lastHour = now;
      GrassSystem._creep(level, hours);
    }
  },

  /** the hours' creep rolls — see the header; a map whose palette lacks grass or HOST no-ops */
  _creep(level, hours) {
    const grass = Grassland.type(level, "grass");
    const host = Grassland.type(level, Grassland.HOST);
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
    if (grew) Grassland.mark(level);
  },
};

/**
 * A plan is a LevelData, so a captured plan is a prefab body.
 *
 * capture() reads a plan off a cell rect of the live map — every tile layer but the terrain, plus
 * the built entities as catalog descriptors carrying the `item` id stamp() rebuilds them from, and
 * optionally each one's exact record. export() writes a plan as a pretty prefab literal.
 *
 * stamp() places a plan through the build path, so a stamped build is identical to a hand-placed
 * one. Only catalog content survives: a tiles entry no catalog item paints, or a spawn without
 * `item`, is skipped with a warning. Ungated — the caller decides validity and cost.
 */
globalThis.Blueprint = {
  /** The cell rect (x1,y1)-(x2,y2) inclusive, as a plan local to (x1,y1). */
  capture(level, x1, y1, x2, y2, opts = {}) {
    const cols = x2 - x1 + 1;
    const rows = y2 - y1 + 1;
    const tiles = [];
    const rt = ColonyMap.runtime(level);
    for (let l = 0; l < contentTiles.LAYERS.length; l++) {
      const cfg = contentTiles.LAYERS[l];
      if (cfg.key === "terrain") continue; // the biome ground is the generator's, never content
      const layer = rt[cfg.key + "Layer"];
      if (cfg.materials !== undefined) {
        // one entry per material present
        const types = rt[cfg.key + "Types"];
        for (let m = 0; m < cfg.materials.length; m++) {
          const key = cfg.materials[m].key;
          const type = types[key];
          const rects = Grid.meshRects(
            cols,
            rows,
            (x, y) => layer.get(x1 + x, y1 + y) === type,
          );
          if (rects.length > 0)
            tiles.push({ layer: cfg.key, material: key, rects: rects });
        }
      } else {
        const rects = Grid.meshRects(
          cols,
          rows,
          (x, y) => !!layer.get(x1 + x, y1 + y),
        );
        if (rects.length > 0) tiles.push({ layer: cfg.key, rects: rects });
      }
    }
    const spawns = [];
    const builtEnts = Build.of(level).builtEnts;
    const ek = Object.keys(builtEnts);
    for (let i = 0; i < ek.length; i++) {
      const c = ek[i].split(",");
      const gx = Number(c[0]);
      const gy = Number(c[1]);
      if (gx < x1 || gx > x2 || gy < y1 || gy > y2) continue;
      const e = builtEnts[ek[i]];
      const item = contentBuild.item(e.itemId);
      if (item === undefined) continue; // stale catalog id
      // described at the live cell (a door orients off its neighbours), then localised
      const s = Build.descriptor(level, item, gx, gy);
      s.gx = gx - x1;
      s.gy = gy - y1;
      s.item = e.itemId;
      if (opts.withState === true && level.entities.isValid(e.ent))
        s.record = Row.capture(level.entities, e.ent);
      spawns.push(s);
    }
    return { cols: cols, rows: rows, tiles: tiles, spawns: spawns };
  },

  /**
   * Tiles go down first, so a door reads its finished neighbouring walls. Returns the number of
   * placements made.
   */
  stamp(level, ox, oy, plan) {
    if (plan === null || plan === undefined) return 0;
    let n = 0;
    const tiles = plan.tiles ?? [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const item = contentBuild.tileItem(t.layer, t.material);
      if (item === undefined) {
        Log.warn(
          `Blueprint: no catalog item paints ${t.layer}/${t.material ?? "default"} — skipped`,
        );
        continue;
      }
      for (let r = 0; r < t.rects.length; r++) {
        const rc = t.rects[r];
        for (let y = rc[1]; y < rc[1] + rc[3]; y++)
          for (let x = rc[0]; x < rc[0] + rc[2]; x++) {
            Build.put(level, ox + x, oy + y, item);
            n++;
          }
      }
    }
    const spawns = plan.spawns ?? [];
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const item = s.item !== undefined ? contentBuild.item(s.item) : undefined;
      if (item === undefined) {
        Log.warn(`Blueprint: spawn "${s.preset}" is no catalog item — skipped`);
        continue;
      }
      // an id that is now a tile item lands as that tile, its record ignored
      Build.put(level, ox + s.gx, oy + s.gy, item, {
        record: s.record,
      });
      n++;
    }
    return n;
  },

  /** Written to `name` in the save dir. */
  export(plan, name) {
    const text = Json.encode(plan, { pretty: true });
    if (text === undefined) return false; // never write a truncated plan
    File.write(name, text);
    return true;
  },
};

/**
 * A plan is a LevelData, so a captured plan is a prefab body.
 *
 * capture() reads a plan off a cell rect of the live map — every tile layer but the terrain, plus
 * the Structures as catalog descriptors carrying the `item` id stamp() rebuilds them from, and
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
    for (let l = 0; l < contentTiles.LAYERS.length; l++) {
      const cfg = contentTiles.LAYERS[l];
      if (cfg.key === "terrain") continue; // the biome ground is the generator's, never content
      const layer = level.grid.layer(cfg.key);
      if (cfg.materials !== undefined) {
        // one entry per material present
        for (let m = 0; m < cfg.materials.length; m++) {
          const key = cfg.materials[m].key;
          const type = layer.type(key);
          const cells = Blueprint._cells(
            cols,
            rows,
            (x, y) => layer.get(x1 + x, y1 + y) === type,
          );
          if (cells.length > 0)
            tiles.push({ layer: cfg.key, material: key, cells: cells });
        }
      } else {
        const cells = Blueprint._cells(
          cols,
          rows,
          (x, y) => !!layer.get(x1 + x, y1 + y),
        );
        if (cells.length > 0) tiles.push({ layer: cfg.key, cells: cells });
      }
    }
    const spawns = [];
    const cw = level.grid.cellWidth;
    const ch = level.grid.cellHeight;
    level.entities.forEach([Structure, Position], (id, st, pos) => {
      const gx = Math.floor(pos.x / cw);
      const gy = Math.floor(pos.y / ch);
      if (gx < x1 || gx > x2 || gy < y1 || gy > y2) return;
      const item = contentBuild.item(st.item);
      if (item === undefined) return; // stale catalog id
      // described at the live cell (a door orients off its neighbours), then localised
      const s = Build.descriptor(level, item, gx, gy);
      s.gx = gx - x1;
      s.gy = gy - y1;
      if (opts.withState === true) s.record = level.entities.capture(id);
      spawns.push(s);
    });
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
      const c = t.cells;
      for (let j = 0; j < c.length; j += 2) {
        Build.put(level, ox + c[j], oy + c[j + 1], item);
        n++;
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

  /** A cols×rows area's cells where `has(x, y)` holds, as flat x/y pairs. */
  _cells(cols, rows, has) {
    const out = [];
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) if (has(x, y)) out.push(x, y);
    return out;
  },
};

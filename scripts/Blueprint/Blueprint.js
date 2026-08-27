/**
 * A plan is a LevelData — Core's one authored-content shape: `tiles` per (layer, material) as
 * origin-local rects, `spawns` as descriptors — so a captured plan IS a prefab body.
 *
 * capture() reads a plan off a cell rect of the LIVE map: every tile layer but the terrain,
 * greedy-meshed per material (the generator's walls and the player's alike — what stands there),
 * plus the built entities inside the rect as their catalog descriptors, each carrying `item` (its
 * BuildMode catalog id, which is what stamp() rebuilds it from) and, with opts.withState, its exact
 * EntitySnapshot as `snapshot` (a chest keeps its contents, a turret its damage). export() writes
 * a plan as the pretty literal contentPrefabs takes — the DEV capture tool's exit (BuildMode).
 *
 * stamp() puts a plan down at (ox, oy) through BuildMode.applyItem, so a stamped build is
 * identical to a hand-placed one (colliders, _built / _builtEnts tracking, render dirty), the
 * solid layers remeshed once at the end. The build path only knows the catalog: a tiles entry no
 * catalog item paints, or a spawn without `item`, is skipped with a warning. Ungated — the caller
 * decides validity/cost.
 */
globalThis.Blueprint = {
  /**
   * Capture the cell rect (x1,y1)-(x2,y2) inclusive into a plan (coords relative to x1,y1);
   * opts.withState → include each built entity's exact snapshot.
   */
  capture(scene, x1, y1, x2, y2, opts = {}) {
    const cols = x2 - x1 + 1;
    const rows = y2 - y1 + 1;
    const tiles = [];
    for (let l = 0; l < contentTiles.LAYERS.length; l++) {
      const cfg = contentTiles.LAYERS[l];
      if (cfg.key === "terrain") continue; // the biome ground is the generator's, never content
      const layer = scene[cfg.key + "Layer"];
      if (cfg.materials !== undefined) {
        // one entry per material present, so the rects carry the material key
        const types = scene[cfg.key + "Types"];
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
    const ek = Object.keys(scene._builtEnts);
    for (let i = 0; i < ek.length; i++) {
      const c = ek[i].split(",");
      const gx = Number(c[0]);
      const gy = Number(c[1]);
      if (gx < x1 || gx > x2 || gy < y1 || gy > y2) continue;
      const e = scene._builtEnts[ek[i]];
      const item = BuildMode.item(e.itemId);
      if (item === undefined) continue; // stale/removed catalog id
      // make() at the LIVE cell (a door orients off its neighbours), then localise
      const s = item.make(gx, gy, scene);
      s.gx = gx - x1;
      s.gy = gy - y1;
      s.item = e.itemId;
      if (opts.withState === true && scene.level.entities.isValid(e.ent))
        s.snapshot = EntitySnapshot.capture(scene.level.entities, e.ent);
      spawns.push(s);
    }
    return { cols: cols, rows: rows, tiles: tiles, spawns: spawns };
  },

  /**
   * Stamp a plan with its origin at cell (ox, oy). Tiles go down first (so a door reads its
   * finished neighbouring walls), then entities. Returns the number of placements made.
   */
  stamp(scene, ox, oy, plan) {
    if (plan === null || plan === undefined) return 0;
    let n = 0;
    const remesh = {}; // solid layer key -> true (remeshed once at the end)
    const tiles = plan.tiles ?? [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const item = Blueprint._tileItem(t.layer, t.material);
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
            const solid = BuildMode.applyItem(scene, ox + x, oy + y, item, {
              deferRemesh: true,
            });
            if (solid === true) remesh[item.layer] = true;
            n++;
          }
      }
    }
    const spawns = plan.spawns ?? [];
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const item = s.item !== undefined ? BuildMode.item(s.item) : undefined;
      if (item === undefined) {
        Log.warn(`Blueprint: spawn "${s.preset}" is no catalog item — skipped`);
        continue;
      }
      // an id that has since become a TILE item (the fence) lands as that tile — applyItem's tile
      // branch ignores the snapshot, which is how an old plan's fence entities migrate
      BuildMode.applyItem(scene, ox + s.gx, oy + s.gy, item, {
        snapshot: s.snapshot,
      });
      n++;
    }
    BuildMode.remeshLayers(scene, remesh);
    return n;
  },

  /** the pretty literal form (Json.encode pretty), written to `name` in the save dir */
  export(plan, name) {
    const text = Json.encode(plan, { pretty: true });
    if (text === undefined) return false; // codec already Log.error'd — never write a truncated plan
    return File.write(name, text);
  },

  /** the catalog tile item painting (layer, material) — `mat` undefined is the layer's default */
  _tileItem(layer, material) {
    for (let c = 0; c < BuildMode.CATALOG.length; c++) {
      const items = BuildMode.CATALOG[c].items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "tile" && it.layer === layer && it.mat === material)
          return it;
      }
    }
    return undefined;
  },
};

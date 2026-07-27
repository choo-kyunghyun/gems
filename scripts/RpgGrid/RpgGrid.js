// Level builder for the top-down demo (LevelSerializer genre "topdown") — build() creates the
// resident tile layers and returns the grid handle. Contract on the RpgGrid declaration below.

const RPG_CELL = 32; // fallback cell size when a level omits `cell` (32px convention — the 2026-07 media set is authored 1:1 at 32px/cell)

/**
 * build() creates the resident tile layers from LAYERS (terrain/floor/wall/fence, bottom→top) and
 * returns { grid, spawn, colliders, <key>Layer/<key>Type per layer }; the level owns the grid's
 * lifecycle. Wall colliders are greedy-meshed by TileEdit.
 *
 * Level data: { cell?, cols, rows, meta: { playerSpawn }, walls: [[x,y,w,h]...] } — walls are cell
 * rectangles (map straight onto the greedy mesh). Grid size is cols/rows, NOT the room, so a level
 * can exceed the view and the follow camera scrolls across it.
 */
globalThis.RpgGrid = {
  // World graph: map id → level file. Maps are connected by `portal` spawns (see RpgSpawn.spawn).
  // Seed registry — extract to a `maps.json` manifest if it grows. START is the boot map.
  // DISCRETE FILES, not one streamed world: a level file has to parse in one go, and a level owns
  // exactly one entity store — so map size is bounded by both. The chunked overworld streams
  // WITHIN one such map; the graph is how the world grows past it.
  MAPS: {
    overworld: "levels/overworld.json",
    interior_01: "levels/interior_01.json",
  },
  START: "overworld",
  mapFile(id) {
    return RpgGrid.MAPS[id];
  },

  // one-shot editor→play hand-off: the level editor's Test Play sets a save-dir level file;
  // sceneRpg consumes it once on create, then clears it
  playtestFile: undefined,

  // Resident-grid tile layers, bottom→top — one material each. RenderTileMap autotiles by
  // OCCUPANCY (not tile-type), so materials with different autotile modes (wall=corner,
  // fence=blob16) CAN'T share a TileLayer — each gets its own layer + pass. `type`: "dual"
  // corner-grid, "corner" 13-piece sub-tile, 0 raw single-frame, 16 blob4, 47 blob8. For a
  // type-0 layer RenderTileMap uses TileType.id as the frame index, so `floor.id` MUST be a real
  // frame. `pathCost: null` → blocking; `solid` layers are greedy-meshed. `fill` auto-fills the
  // grid (walkable base) on plain maps; chunked builds these EMPTY. Order = nav priority (top wins).
  // `name` is an I18n key (resolved at build in _makeLayers — top level runs before the locale loads).
  LAYERS: [
    {
      key: "terrain",
      id: 1,
      name: "TILE_TERRAIN",
      type: "dual",
      sprite: "spr_tiledual",
      // desaturated olive matching the streamed grass base (style-spec GROUND band)
      color: "#79825a",
      solid: false,
      pathCost: 1,
      emptyCost: 1,
      fill: true,
    },
    {
      key: "floor",
      // spr_tex_plaid = near-white checker weave (spr_tex_brick is the WALL texture — see
      // RpgMap._buildRenderer); wood-tan tint -> parquet flooring. For a type-0 layer the
      // id IS the frame index (and must be non-zero: 0 reads as empty occupancy).
      id: 1,
      name: "BUILD_FLOOR",
      type: 0,
      sprite: "spr_tex_plaid",
      color: "#aa9472",
      solid: false,
      pathCost: 1,
    },
    // Floor VARIANTS — one type-0 layer per material (the LAYERS design rule: one material
    // per layer + pass; the spare near-white spr_tex_* sheets each get their own tint).
    // Build-Mode-only surfaces: level files paint only `floor`, chunked maps hold them empty.
    {
      key: "floorTile",
      id: 1,
      name: "BUILD_FLOOR_TILE",
      type: 0,
      sprite: "spr_tex_tile",
      color: "#9dadb2",
      solid: false,
      pathCost: 1,
    },
    {
      key: "floorCarpet",
      id: 1,
      name: "BUILD_FLOOR_CARPET",
      type: 0,
      sprite: "spr_tex_carpet",
      color: "#a05a50",
      solid: false,
      pathCost: 1,
    },
    {
      key: "floorMosaic",
      id: 1,
      name: "BUILD_FLOOR_MOSAIC",
      type: 0,
      sprite: "spr_tex_mosaic",
      color: "#7096a8",
      solid: false,
      pathCost: 1,
    },
    {
      key: "wall",
      id: 1,
      name: "EDITOR_WALL",
      type: "corner",
      sprite: "spr_tilecorner",
      color: "#707888",
      solid: true,
      pathCost: null,
      // Wall MATERIALS — per-cell TileTypes within this ONE solid layer (unlike the floor
      // variants above, walls stay a single layer so colliders/remesh/nav are untouched —
      // TileEdit meshes by occupancy). Each material = a near-white face texture + tint;
      // RenderWalls buckets cells by TileType id and submits per material (RpgMap wires it).
      // materials[0] is the default (file walls, the editor, streamed occupancy views).
      materials: [
        {
          key: "brick",
          id: 1,
          name: "BUILD_WALL",
          sprite: "spr_tex_brick",
          color: "#707888",
        },
        {
          key: "concrete",
          id: 2,
          name: "BUILD_WALL_CONCRETE",
          sprite: "spr_tex_concrete",
          color: "#9aa0a4",
        },
        {
          key: "metal",
          id: 3,
          name: "BUILD_WALL_METAL",
          sprite: "spr_tex_metal",
          color: "#7d8a96",
        },
        {
          key: "plank",
          id: 4,
          name: "BUILD_WALL_PLANK",
          sprite: "spr_tex_plank",
          color: "#a08050",
        },
      ],
    },
    {
      key: "fence",
      id: 1,
      name: "BUILD_FENCE",
      type: 16,
      sprite: "spr_tile16",
      color: "#8a6d3b",
      solid: true,
      pathCost: null,
    },
  ],

  // LAYERS config by key (BuildMode reads `solid`/`materials` off it).
  layerCfg(key) {
    for (let i = 0; i < RpgGrid.LAYERS.length; i++)
      if (RpgGrid.LAYERS[i].key === key) return RpgGrid.LAYERS[i];
    return undefined;
  },

  // Make the LAYERS TileLayers + TileTypes (bottom→top) and return a handles bag keyed
  // `<key>Layer`/`<key>Type` — plus, for a materials-bearing layer (wall), `<key>Types`:
  // one TileType per material keyed by material key (`<key>Type` stays materials[0], the
  // default every existing consumer paints). Shared by build() + buildChunked().
  _makeLayers(grid) {
    const h = {};
    for (let i = 0; i < RpgGrid.LAYERS.length; i++) {
      const cfg = RpgGrid.LAYERS[i];
      const layer = new TileLayer(grid.cols, grid.rows, {
        emptyCost: cfg.emptyCost,
      });
      grid.insert(layer);
      h[cfg.key + "Layer"] = layer;
      if (cfg.materials !== undefined) {
        const types = {};
        for (let m = 0; m < cfg.materials.length; m++) {
          const mat = cfg.materials[m];
          types[mat.key] = new TileType({
            id: mat.id,
            name: I18n.text(mat.name),
            pathCost: cfg.pathCost,
          });
        }
        h[cfg.key + "Types"] = types;
        h[cfg.key + "Type"] = types[cfg.materials[0].key];
      } else {
        h[cfg.key + "Type"] = new TileType({
          id: cfg.id,
          name: I18n.text(cfg.name),
          pathCost: cfg.pathCost,
        });
      }
    }
    return h;
  },

  // Auto-fill each `fill` layer's grid with its material (the walkable base). Plain maps only —
  // chunked leaves the resident grid empty (ChunkManager owns terrain).
  _fillLayers(grid, h) {
    for (let i = 0; i < RpgGrid.LAYERS.length; i++) {
      const cfg = RpgGrid.LAYERS[i];
      if (!cfg.fill) continue;
      const layer = h[cfg.key + "Layer"];
      const type = h[cfg.key + "Type"];
      for (let y = 0; y < grid.rows; y++)
        for (let x = 0; x < grid.cols; x++) layer.set(x, y, type);
    }
  },

  // Paint cell-rectangles ([x,y,w,h]) of `type` into a layer. An absent array is a no-op, so
  // older level files are unaffected.
  _paintRects(layer, rects, type) {
    if (rects === undefined) return;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      for (let y = r[1]; y < r[1] + r[3]; y++)
        for (let x = r[0]; x < r[0] + r[2]; x++) layer.set(x, y, type);
    }
  },

  /**
   * Build a Level: paint walls + mesh kinematic wall colliders. Returns the built handles; the
   * caller owns grid.destroy() and the colliders. `entryId` selects the player spawn from
   * `meta.entries` (the matching side of a portal), falling back to entries.default → legacy
   * meta.playerSpawn.
   */
  build(entities, data, entryId = "default") {
    const cell = data.cell ?? RPG_CELL;
    const grid = new LevelGrid({
      cellWidth: cell,
      cellHeight: cell,
      cols: data.cols,
      rows: data.rows,
    });
    // Terrain auto-filled as the walkable base; walls + optional floors from the file's
    // cell-rects (fence has no file source yet).
    const h = RpgGrid._makeLayers(grid);
    RpgGrid._fillLayers(grid, h);
    RpgGrid._paintRects(h.wallLayer, data.walls, h.wallType);
    RpgGrid._paintRects(h.floorLayer, data.floors, h.floorType);

    const colliders = [];
    TileEdit.meshSolid(entities, grid, h.wallLayer, colliders);

    const spawn = this._resolveSpawn(grid, data, entryId);
    return { grid, spawn, colliders, ...h };
  },

  /**
   * Build a Level for a CHUNK-STREAMED map: a large resident grid left EMPTY (player builds only).
   * The streamed terrain is owned by the ChunkManager, so nothing is painted/meshed here
   * (colliders: []). Grid size from meta.worldCols/worldRows. Same return shape + layer order as
   * build() so the level code and Level.import round-trip unchanged.
   */
  buildChunked(entities, data, entryId = "default") {
    const cell = data.cell ?? RPG_CELL;
    const cols = data.meta.worldCols ?? data.cols ?? 128;
    const rows = data.meta.worldRows ?? data.rows ?? 128;
    const grid = new LevelGrid({
      cellWidth: cell,
      cellHeight: cell,
      cols,
      rows,
    });
    // Resident grid stays EMPTY (player builds only); streamed terrain + colliders are the
    // ChunkManager's. Same layer set/order as build() so Level.import matches.
    const h = RpgGrid._makeLayers(grid);

    const spawn = this._resolveSpawn(grid, data, entryId);
    return { grid, spawn, colliders: [], ...h };
  },

  /**
   * Wall border ringing a finite chunked world (anchored at cell 0) so the player + enemies can't
   * leave. The 4 colliders are ALWAYS present (not chunk-managed), kinematic-solid like any wall,
   * so SolidSystem collides + NavGrid rasterizes them. Returns the ids (freed by entities.destroy()).
   * Left/right span one cell past top/bottom to cover the outer corners (no diagonal slip-through).
   */
  buildWorldBorder(entities, grid, worldCols, worldRows) {
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;
    const W = worldCols * cw;
    const H = worldRows * ch;
    const rects = [
      [0, -ch, W, ch], // top
      [0, H, W, ch], // bottom
      [-cw, -ch, cw, H + 2 * ch], // left (covers outer corners)
      [W, -ch, cw, H + 2 * ch], // right (covers outer corners)
    ];
    const ids = [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const id = entities.create();
      entities.add(id, Position, { x: r[0], y: r[1], z: 0 });
      entities.add(id, BBox, { x: 0, y: 0, width: r[2], height: r[3] });
      entities.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      ids.push(id);
    }
    return ids;
  },

  // Resolve the player spawn (world coords): named entry → entries.default → legacy meta.playerSpawn.
  _resolveSpawn(grid, data, entryId) {
    const entries = data.meta.entries;
    let entry = data.meta.playerSpawn;
    if (entries !== undefined)
      entry = entries[entryId] ?? entries.default ?? entry;
    return grid.gridToWorld(entry.gx, entry.gy);
  },
};

// Windowed dual-grid renderer for the chunk-streamed overworld TERRAIN — the render half of
// "scale the 3-layer tilemap to the streamed world". Mirrors NavGrid: a fixed-size window of
// TileLayers re-centered on the player's chunk, rasterized from the loaded ChunkManager records'
// per-cell terrain (OverworldGen's value-noise biome), and drawn by the existing RenderTileMap in
// dual mode — so the dual-grid/tint work + spr_tiledual are reused, not reimplemented per chunk.
//
// One TileLayer + one RenderTileMap pass per terrain material (OverworldGen.TERRAIN), stacked
// CUMULATIVELY (a cell of material m fills layers 0..m): the base layer is opaque ground and each
// upper terrain's transparent dual borders reveal the one below (water < sand < grass).
//
// The window is sized to the loaded-chunk box ((2*loadRadius+1) chunks) — bigger than the camera
// view, so its edge fade stays off-screen. rebuild() only re-stamps when the player crosses a chunk
// border (the window origin moves), the same cheap fast-path ChunkManager/NavGrid use.
//
// GMRT-safe: index loops, class on globalThis; RenderTileMap's "level" here is a lightweight window
// descriptor (RenderTileMap reads only cols/rows/cellWidth/cellHeight off it). Origin offset on the
// pass (RenderTileMap.originX/Y) maps the window's local cells to absolute world position.
globalThis.TerrainStream = class TerrainStream {
  // @param {ChunkManager} chunks — read for chunk size, loadRadius, and cell size.
  constructor(chunks) {
    this.chunkCols = chunks.chunkCols;
    this.chunkRows = chunks.chunkRows;
    const span = 2 * chunks.loadRadius + 1; // window size in chunks (covers the loaded box)
    this.cols = span * this.chunkCols;
    this.rows = span * this.chunkRows;
    // Lightweight "level" for RenderTileMap (it only reads these four fields off it).
    this._win = {
      cols: this.cols,
      rows: this.rows,
      cellWidth: chunks.cellW,
      cellHeight: chunks.cellH,
    };
    this._tile = new TileType({ id: 1 }); // occupancy marker (dual frame is corner-derived, not id)
    this.originX = undefined; // window top-left in ABSOLUTE cells; undefined → first rebuild stamps
    this.originY = undefined;

    // One windowed TileLayer + one dual RenderTileMap pass per terrain material.
    const pal = OverworldGen.TERRAIN;
    const spr = asset_get_index("spr_tiledual");
    const ok = sprite_exists(spr); // GMRT: validate via sprite_exists, not >=0
    if (!ok)
      Log.warn("TerrainStream: spr_tiledual missing — overworld terrain off");
    this._layers = [];
    this.passes = []; // RpgMap inserts these into the renderer (under RenderChunks)
    for (let i = 0; i < pal.length; i++) {
      const layer = new TileLayer(this.cols, this.rows);
      this._layers.push(layer);
      if (!ok) continue;
      this.passes.push(
        new RenderTileMap(layer, this._win, spr, {
          autotile: "dual",
          color: Color.parse(pal[i].color),
        }),
      );
    }
  }

  // Re-center the window on the player's chunk and re-stamp the loaded chunks' terrain. No-op until
  // the window origin moves (chunk membership only changes on a chunk-border cross). Call once per
  // frame after chunks.update(), OUTSIDE the tick loop.
  rebuild(chunks) {
    const c = chunks.centerChunk();
    if (c.cx === undefined) return; // no center yet (update() not run)
    const ox = (c.cx - chunks.loadRadius) * this.chunkCols;
    const oy = (c.cy - chunks.loadRadius) * this.chunkRows;
    if (ox === this.originX && oy === this.originY) return; // window unchanged
    this.originX = ox;
    this.originY = oy;

    // Clear every material layer (direct grid-data fill, like NavGrid — 0 = empty cell).
    for (let li = 0; li < this._layers.length; li++) {
      const d = this._layers[li].grid.data;
      for (let i = 0; i < d.length; i++) d[i] = 0;
    }

    // Stamp each loaded chunk's terrain into the window, cumulatively (material m → layers 0..m).
    const cc = this.chunkCols;
    const cr = this.chunkRows;
    const recs = chunks.records();
    for (let r = 0; r < recs.length; r++) {
      const rec = recs[r];
      const terr = rec.terrain;
      if (terr === undefined) continue;
      const baseX = rec.cx * cc - ox; // chunk's top-left as a local window cell
      const baseY = rec.cy * cr - oy;
      for (let ly = 0; ly < cr; ly++) {
        const wy = baseY + ly;
        if (wy < 0 || wy >= this.rows) continue;
        for (let lx = 0; lx < cc; lx++) {
          const wx = baseX + lx;
          if (wx < 0 || wx >= this.cols) continue;
          const m = terr[ly * cc + lx];
          for (let li = 0; li <= m; li++)
            this._layers[li].set(wx, wy, this._tile);
        }
      }
    }

    // Shift the passes' window origin to match + force a VBO rebuild against the new stamp.
    for (let i = 0; i < this.passes.length; i++) {
      this.passes[i].originX = ox;
      this.passes[i].originY = oy;
      this.passes[i].markDirty();
    }
  }

  // Free the windowed layers (the RenderTileMap passes are freed by the renderer's destroy()).
  destroy() {
    for (let i = 0; i < this._layers.length; i++) this._layers[i].destroy();
    this._layers = [];
    this.passes = [];
  }
};

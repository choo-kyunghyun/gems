// Per-chunk dual-grid renderer for the chunk-streamed overworld TERRAIN. A RenderPass owning one
// cached VertexBuffer PER LOADED CHUNK, built ONCE when the chunk appears and freed when it unloads
// — so a chunk-border crossing only builds the few newly-entered chunks, not the whole loaded area.
// (The earlier windowed version rebuilt one ~80x80 VBO every crossing → a ~50ms render hitch; this
// replaces it.) Each chunk's VBO packs all terrain materials (OverworldGen.TERRAIN) in painter order
// — base material first (opaque ground), upper terrains on top whose transparent dual-grid corners
// reveal the one below (water < sand < grass). Reuses spr_tiledual tinted per material.
//
// Dual-grid corner sampling reads one cell up/left of each display tile, so building a chunk needs a
// 1-cell APRON beyond its top/left edge: interior cells come from the chunk record (rec.terrain),
// the apron from the deterministic source (ChunkSource.materialAt), so seams match the neighbor with
// no load-order dependency.
//
// GMRT-safe: Object.keys + index loops (no Map/Set iteration), class on globalThis.
//
// @implements {RenderPass}
globalThis.TerrainStream = class TerrainStream {
  // @param {ChunkManager} chunks — read for chunk size, cell size, and the source (apron sampling).
  constructor(chunks) {
    this.enabled = true; // RenderPass
    this.chunkCols = chunks.chunkCols;
    this.chunkRows = chunks.chunkRows;
    this.cellW = chunks.cellW;
    this.cellH = chunks.cellH;
    this.source = chunks.source; // ChunkSource.materialAt for the seam apron
    this._cache = {}; // "cx,cy" → VertexBuffer (one per loaded chunk)
    this._buildBudget = 4; // chunk VBOs built per rebuild() — caps the per-frame build spike

    const pal = OverworldGen.TERRAIN;
    this.palette = pal;
    this._colors = [];
    for (let i = 0; i < pal.length; i++)
      this._colors.push(Color.parse(pal[i].color));

    this._spr = asset_get_index("spr_tiledual");
    this._ok = sprite_exists(this._spr); // GMRT: validate via sprite_exists, not >=0
    if (!this._ok) {
      Log.warn("TerrainStream: spr_tiledual missing — overworld terrain off");
      return;
    }
    this._tex = sprite_get_texture(this._spr, 0);
    this._sw = sprite_get_width(this._spr);
    this._sh = sprite_get_height(this._spr);
  }

  // Diff the loaded chunk set against the cache — free vanished chunks, build newly-loaded ones (at
  // most `budget` per call, so a burst can't spike; the rest fill in over the next frames, off-screen
  // at loadRadius distance). Call each frame from sceneRpg.step (default budget); the initial load
  // passes Infinity to build everything at once under the boot fade. Cheap when nothing changed.
  rebuild(chunks, budget = this._buildBudget) {
    if (!this._ok) return;
    const recs = chunks.records();

    // Free chunks no longer loaded.
    const seen = {};
    for (let i = 0; i < recs.length; i++)
      seen[recs[i].cx + "," + recs[i].cy] = true;
    const keys = Object.keys(this._cache);
    for (let i = 0; i < keys.length; i++) {
      if (seen[keys[i]] !== true) {
        this._cache[keys[i]].destroy();
        delete this._cache[keys[i]];
      }
    }

    // Build newly-loaded chunks, capped at `budget`.
    let left = budget;
    for (let i = 0; i < recs.length && left > 0; i++) {
      const rec = recs[i];
      const key = rec.cx + "," + rec.cy;
      if (this._cache[key] === undefined) {
        this._cache[key] = this._buildChunk(rec);
        left--;
      }
    }
  }

  // The RenderPass draw: just submit every cached chunk VBO (no rebuild — that's the point).
  draw(_world) {
    if (!this._ok) return;
    const keys = Object.keys(this._cache);
    for (let i = 0; i < keys.length; i++)
      this._cache[keys[i]].submit(this._tex);
  }

  // Build one chunk's terrain VBO (all material layers, cumulative + painter-ordered). `rec.terrain`
  // is the chunk's interior material grid (row-major lx + ly*cols); the apron is sampled live.
  _buildChunk(rec) {
    const cc = this.chunkCols;
    const cr = this.chunkRows;
    const cw = this.cellW;
    const ch = this.cellH;
    const hw = cw * 0.5;
    const hh = ch * 0.5;
    const x0 = rec.cx * cc; // chunk's first cell, absolute
    const y0 = rec.cy * cr;
    const interior = rec.terrain;

    // Padded material grid covering cells [x0-1, x0+cc) x [y0-1, y0+cr) → (cc+1)x(cr+1). Interior
    // (i>0 && j>0) from the record; the top row + left column (the dual apron) from the source.
    const pw = cc + 1;
    const pad = new Array(pw * (cr + 1));
    for (let j = 0; j <= cr; j++) {
      for (let i = 0; i <= cc; i++) {
        const gx = x0 - 1 + i;
        const gy = y0 - 1 + j;
        pad[j * pw + i] =
          i > 0 && j > 0 && interior !== undefined
            ? interior[(gy - y0) * cc + (gx - x0)]
            : this.source.materialAt(gx, gy);
      }
    }

    const vb = new VertexBuffer();
    vb.begin();
    const layers = this.palette.length;
    for (let m = 0; m < layers; m++) {
      const color = this._colors[m];
      for (let ly = 0; ly < cr; ly++) {
        for (let lx = 0; lx < cc; lx++) {
          // Display tile centered on data-corner (gx,gy) = (x0+lx, y0+ly); samples the 4 cells it
          // touches against layer m (cumulative: a cell is "in layer m" iff its material >= m).
          const bi = lx + 1; // pad column of cell (x0+lx); cell (x0+lx-1) is bi-1
          const bj = ly + 1; // pad row of cell (y0+ly)
          let mask = 0;
          if (pad[(bj - 1) * pw + (bi - 1)] >= m) mask |= 1; // TL
          if (pad[(bj - 1) * pw + bi] >= m) mask |= 2; // TR
          if (pad[bj * pw + bi] >= m) mask |= 4; // BR
          if (pad[bj * pw + (bi - 1)] >= m) mask |= 8; // BL
          if (mask === 0) continue;
          // Trim-aware quad (mirrors RenderTileMap._quad): honor the packer's per-frame UV offset/
          // size factors so a trimmed frame isn't stretched to the full cell. frame index = mask.
          const uvs = sprite_get_uvs(this._spr, mask);
          const wx = (x0 + lx) * cw - hw;
          const wy = (y0 + ly) * ch - hh;
          vb.addQuad(
            wx + uvs[4] * (cw / this._sw),
            wy + uvs[5] * (ch / this._sh),
            cw * uvs[6],
            ch * uvs[7],
            uvs[0],
            uvs[1],
            uvs[2],
            uvs[3],
            color,
            1,
          );
        }
      }
    }
    vb.end(true); // freeze: static per-chunk mesh, uploaded once
    return vb;
  }

  // Free every cached chunk VBO. Idempotent (safe if the renderer also calls it on destroy).
  destroy() {
    const keys = Object.keys(this._cache);
    for (let i = 0; i < keys.length; i++) this._cache[keys[i]].destroy();
    this._cache = {};
  }
};

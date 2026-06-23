// Per-chunk dual-grid renderer for the chunk-streamed overworld TERRAIN. A RenderPass owning a set
// of cached VertexBuffers PER LOADED CHUNK (one per terrain material), built ONCE when the chunk
// appears and freed when it unloads — so a chunk-border crossing only builds the few newly-entered
// chunks, not the whole loaded area. (The earlier windowed version rebuilt one ~80x80 VBO every
// crossing → a ~50ms render hitch; this replaces it.) Each material's tiles go in painter order —
// base material first (opaque ground), upper terrains on top whose transparent dual-grid corners
// reveal the one below (water < sand < grass). Each material draws its OWN real, UNTINTED dual-grid
// sprite (spr_terrain*, from OverworldGen.TERRAIN.sprite) into its OWN VBO submitted with its OWN
// texture — so the per-material tilesets needn't share a texture page (no tint; the art is colored).
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
    this._cache = {}; // "cx,cy" → [{ vb, tex }] (one per terrain material)
    this._buildBudget = 4; // chunk VBO sets built per rebuild() — caps the per-frame build spike

    // One UNTINTED dual-grid sprite per material (spr_terrain*), painter-ordered like the palette
    // (water < sand < grass). Cache each sprite's texture + source size for the trim-aware quad.
    const pal = OverworldGen.TERRAIN;
    this.palette = pal;
    this._sprites = [];
    this._ok = true;
    for (let i = 0; i < pal.length; i++) {
      const spr = asset_get_index(pal[i].sprite);
      if (!sprite_exists(spr)) {
        // GMRT: validate via sprite_exists, not >=0
        Log.warn(`TerrainStream: ${pal[i].sprite} missing — overworld terrain off`);
        this._ok = false;
        return;
      }
      // Frames 0..15 are the dual-grid corner masks; any frames beyond 15 are extra FULL-tile
      // (mask-15) variants. `variants` = how many full-tile choices exist (>=1); a full cell picks
      // one by position hash to break the per-tile grid repetition.
      this._sprites.push({
        spr,
        tex: sprite_get_texture(spr, 0),
        sw: sprite_get_width(spr),
        sh: sprite_get_height(spr),
        variants: Math.max(1, sprite_get_number(spr) - 15),
      });
    }
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
        this._destroyChunk(this._cache[keys[i]]);
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

  // The RenderPass draw: submit every cached chunk's per-material VBOs, each with its own texture
  // (no rebuild — that's the point). Material order is painter order (water under sand under grass).
  draw(_world) {
    if (!this._ok) return;
    const keys = Object.keys(this._cache);
    for (let i = 0; i < keys.length; i++) {
      const list = this._cache[keys[i]];
      for (let j = 0; j < list.length; j++) list[j].vb.submit(list[j].tex);
    }
  }

  // Build one chunk's terrain VBOs — one per material layer, cumulative + painter-ordered, each with
  // its own sprite/texture. `rec.terrain` is the chunk's interior material grid (row-major
  // lx + ly*cols); the apron is sampled live. Returns [{ vb, tex }] (a material with no tiles in this
  // chunk is skipped, so the base water layer is always present, upper layers only where they appear).
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

    const out = [];
    const layers = this.palette.length;
    for (let m = 0; m < layers; m++) {
      const s = this._sprites[m];
      const vb = new VertexBuffer();
      vb.begin();
      let any = false;
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
          // Frame = the corner mask, except a FULL cell (mask 15) picks one of the full-tile
          // variants by a per-cell position hash — so interior terrain doesn't repeat the identical
          // tile in a visible grid. Borders (mask 1..14) always use the base variant (frame == mask).
          const frame =
            mask === 15 && s.variants > 1
              ? 15 + this._variant(x0 + lx, y0 + ly, s.variants)
              : mask;
          // Trim-aware quad (mirrors RenderTileMap._quad): honor the packer's per-frame UV offset/
          // size factors so a trimmed frame isn't stretched to the full cell.
          // Untinted (addQuad defaults color=c_white) — the sprite already carries the material color.
          const uvs = sprite_get_uvs(s.spr, frame);
          const wx = (x0 + lx) * cw - hw;
          const wy = (y0 + ly) * ch - hh;
          vb.addQuad(
            wx + uvs[4] * (cw / s.sw),
            wy + uvs[5] * (ch / s.sh),
            cw * uvs[6],
            ch * uvs[7],
            uvs[0],
            uvs[1],
            uvs[2],
            uvs[3],
          );
          any = true;
        }
      }
      vb.end(true); // freeze: static per-chunk mesh, uploaded once
      if (any) out.push({ vb, tex: s.tex });
      else vb.destroy();
    }
    return out;
  }

  // Deterministic per-cell variant index in [0, n): a MINSTD integer-float hash of the absolute
  // cell coords (no bitwise chain — GMRT miscompiles xorshift; mirrors OverworldGen._hash). Pure in
  // (gx, gy), so a chunk reload picks the same variants and seams stay stable across streaming.
  _variant(gx, gy, n) {
    const M = 2147483647;
    let h = 374761393 % M;
    h = (((h * 31 + (gx | 0) * 1900613) % M) + M) % M;
    h = (((h * 31 + (gy | 0) * 7368787) % M) + M) % M;
    h = (h * 48271) % M;
    return h % n;
  }

  // Free one chunk's per-material VBOs.
  _destroyChunk(list) {
    for (let i = 0; i < list.length; i++) list[i].vb.destroy();
  }

  // Free every cached chunk's VBOs. Idempotent (safe if the renderer also calls it on destroy).
  destroy() {
    const keys = Object.keys(this._cache);
    for (let i = 0; i < keys.length; i++) this._destroyChunk(this._cache[keys[i]]);
    this._cache = {};
  }
};

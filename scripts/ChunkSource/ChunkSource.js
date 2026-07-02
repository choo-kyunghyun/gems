// RPG content router for the chunk streamer (the ChunkManager `source`) — decides where a chunk's
// terrain + spawns come from, generating none itself: an AUTHORED OVERLAY (the level file's walls +
// spawns, indexed by chunk) holds the hand-built hub procedural-free; everything else is delegated
// to a swappable GENERATOR (default OverworldGen) with the generate(cx,cy) contract.
//
// Returns ABSOLUTE grid coords (gridToWorld handles negatives); ChunkManager bounds which chunks it
// streams. Entity construction is delegated to RpgSpawn.spawnEntity.
globalThis.ChunkSource = class ChunkSource {
  constructor(opts = {}) {
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    // procedural generator for non-authored chunks; injectable, defaults to a seeded OverworldGen
    this.generator =
      opts.generator ??
      new OverworldGen({
        seed: opts.seed ?? 1337,
        chunkCols: this.chunkCols,
        chunkRows: this.chunkRows,
      });

    // authored overlay, indexed by "cx,cy"
    this._authWalls = {};
    this._authSpawns = {};
    // bbox (chunk coords) of authored content — any chunk inside it suppresses procedural, so the
    // hub area stays clean even where sparse
    this._hasAuth = false;
    this._minCx = 0;
    this._minCy = 0;
    this._maxCx = 0;
    this._maxCy = 0;

    if (opts.authored !== undefined) this._indexAuthored(opts.authored);
  }

  _key(cx, cy) {
    return cx + "," + cy;
  }
  _chunkOf(gx, gy) {
    return {
      cx: Math.floor(gx / this.chunkCols),
      cy: Math.floor(gy / this.chunkRows),
    };
  }

  // Index a level file's walls + spawns into per-chunk buckets (a wall rect filed by its top-left
  // chunk). "reach" spawns stay in — spawn() skips them; the scene resolves the reach zone separately.
  _indexAuthored(data) {
    const walls = data.walls ?? [];
    for (let i = 0; i < walls.length; i++) {
      const r = walls[i];
      const c = this._chunkOf(r[0], r[1]);
      this._bump(c.cx, c.cy);
      const k = this._key(c.cx, c.cy);
      (this._authWalls[k] = this._authWalls[k] ?? []).push(r);
    }
    const spawns = data.spawns ?? [];
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const c = this._chunkOf(s.gx, s.gy);
      this._bump(c.cx, c.cy);
      const k = this._key(c.cx, c.cy);
      (this._authSpawns[k] = this._authSpawns[k] ?? []).push(s);
    }
  }

  _bump(cx, cy) {
    if (!this._hasAuth) {
      this._hasAuth = true;
      this._minCx = this._maxCx = cx;
      this._minCy = this._maxCy = cy;
      return;
    }
    if (cx < this._minCx) this._minCx = cx;
    if (cx > this._maxCx) this._maxCx = cx;
    if (cy < this._minCy) this._minCy = cy;
    if (cy > this._maxCy) this._maxCy = cy;
  }

  _inAuthoredBox(cx, cy) {
    return (
      this._hasAuth &&
      cx >= this._minCx &&
      cx <= this._maxCx &&
      cy >= this._minCy &&
      cy <= this._maxCy
    );
  }

  // deterministic { terrain, solid, walls, spawns } — authored chunks take walls/spawns from the
  // overlay, everything else from the generator
  generate(cx, cy) {
    if (this._inAuthoredBox(cx, cy)) {
      const k = this._key(cx, cy);
      // terrain is biome-everywhere (a pure coord fn), so the hub renders the same continuous biome
      // as the wilderness; the overlay overrides only walls/spawns, but biome solids still collide
      return {
        terrain:
          this.generator.terrain !== undefined
            ? this.generator.terrain(cx, cy)
            : undefined,
        solid:
          this.generator.solidTerrain !== undefined
            ? this.generator.solidTerrain(cx, cy)
            : [],
        walls: this._authWalls[k] ?? [],
        spawns: this._authSpawns[k] ?? [],
      };
    }
    return this.generator.generate(cx, cy); // generate() already includes terrain + solid
  }

  // single-cell terrain material (for TerrainStream's seam apron); no generator materialAt → 0
  materialAt(ax, ay) {
    return this.generator.materialAt !== undefined
      ? this.generator.materialAt(ax, ay)
      : 0;
  }

  // per-cell terrain movement cost (NavGrid weights + PathFollow speed); no generator costAt → 1
  costAt(ax, ay) {
    return this.generator.costAt !== undefined
      ? this.generator.costAt(ax, ay)
      : 1;
  }

  // construct one spawn descriptor's entity (delegated to RpgSpawn); non-entity presets return -1
  spawn(world, level, desc) {
    return RpgSpawn.spawnEntity(world, level, desc);
  }
};

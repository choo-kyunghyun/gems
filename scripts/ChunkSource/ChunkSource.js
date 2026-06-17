// RPG content ROUTER for the chunk streamer (the ChunkManager `source`). Decides where a
// chunk's terrain + entity spawns come from, but no longer generates them itself:
//   • AUTHORED ORIGIN OVERLAY — the hand-built overworld (the level file's walls + spawns),
//     indexed by chunk so the designed hub (Elder, cave portal, chest, workbench, claim post)
//     appears in its chunks and stays procedural-free;
//   • everything else is delegated to a swappable GENERATOR (default OverworldGen) — so world
//     generation isn't fixed: pass a different `generator` (cave/desert/...) for a different
//     wilderness with the same generate(cx,cy) contract.
//
// Coordinates returned are ABSOLUTE grid coords (gridToWorld handles negatives), so any cx/cy
// generates consistently — ChunkManager bounds which chunks it actually streams (the world is a
// finite rectangle now, not infinite). Entity construction is delegated to RpgSpawn.spawnEntity —
// the single place entities are built.
globalThis.ChunkSource = class ChunkSource {
  constructor(opts = {}) {
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    // The procedural generator for non-authored chunks. Injectable so generation is swappable;
    // defaults to the overworld generator seeded to match the map.
    this.generator =
      opts.generator ??
      new OverworldGen({
        seed: opts.seed ?? 1337,
        chunkCols: this.chunkCols,
        chunkRows: this.chunkRows,
      });

    // Authored overlay, indexed by "cx,cy".
    this._authWalls = {};
    this._authSpawns = {};
    // Bounding box (in chunk coords) of all authored content — any chunk inside it is treated
    // as authored (procedural suppressed) so the hub area stays clean even where it's sparse.
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

  // Index a level file's walls + entity spawns into per-chunk buckets. A wall rect is filed by
  // its top-left chunk (the authored hub clusters are small, within a chunk or two — a rect
  // straddling a border still meshes as one collider when that chunk loads). "reach" spawns are
  // left in (ChunkSource.spawn skips them; the scene resolves the reach zone separately).
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

  // ChunkManager contract: deterministic { terrain, walls, spawns } for a chunk — authored hub
  // chunks take their walls/spawns from the overlay, everything else from the generator.
  generate(cx, cy) {
    if (this._inAuthoredBox(cx, cy)) {
      const k = this._key(cx, cy);
      // Terrain is biome-everywhere (a pure coord function), so authored hub chunks render the
      // same continuous biome as the wilderness around them — the overlay overrides only
      // walls/spawns. A custom generator without terrain() simply yields no ground here.
      return {
        terrain:
          this.generator.terrain !== undefined
            ? this.generator.terrain(cx, cy)
            : undefined,
        walls: this._authWalls[k] ?? [],
        spawns: this._authSpawns[k] ?? [],
      };
    }
    return this.generator.generate(cx, cy); // generate() already includes terrain
  }

  // Single-cell terrain material (delegates to the generator) — for TerrainStream's seam apron,
  // which samples a chunk's neighbor cells. A generator without materialAt → 0 (flat base).
  materialAt(ax, ay) {
    return this.generator.materialAt !== undefined
      ? this.generator.materialAt(ax, ay)
      : 0;
  }

  // ChunkManager contract: construct one spawn descriptor's entity (delegated to RpgSpawn so
  // entity construction stays in one place). Non-entity presets (e.g. "reach") return -1.
  spawn(world, level, desc) {
    return RpgSpawn.spawnEntity(world, level, desc);
  }
};

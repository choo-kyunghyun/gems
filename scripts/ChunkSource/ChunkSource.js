// RPG content provider for the chunk streamer (the ChunkManager `source`). Produces a chunk's
// terrain + entity spawns from one of two sources:
//   • the AUTHORED ORIGIN OVERLAY — the hand-built overworld (the level file's walls + spawns),
//     indexed by chunk so the designed hub (Elder, cave portal, chest, workbench, claim post)
//     appears in its chunks and stays procedural-free;
//   • PROCEDURAL SCATTER everywhere else — deterministic from (cx, cy, seed), so a chunk
//     regenerates identically every visit (the contract the ChunkManager's terrain relies on).
//
// Coordinates returned are ABSOLUTE grid coords (gridToWorld handles negatives), so chunks
// extend infinitely in every direction. Entity construction is delegated to
// RpgLevel.spawnEntity — the single place entities are built.
globalThis.ChunkSource = class ChunkSource {
  constructor(opts = {}) {
    this.seed = (opts.seed ?? 1337) | 0;
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;

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

  // ChunkManager contract: deterministic { walls, spawns } for a chunk.
  generate(cx, cy) {
    if (this._inAuthoredBox(cx, cy)) {
      const k = this._key(cx, cy);
      return {
        walls: this._authWalls[k] ?? [],
        spawns: this._authSpawns[k] ?? [],
      };
    }
    return this._procedural(cx, cy);
  }

  // ChunkManager contract: construct one spawn descriptor's entity (delegated to RpgLevel so
  // entity construction stays in one place). Non-entity presets (e.g. "reach") return -1.
  spawn(world, level, desc, playerId) {
    return RpgLevel.spawnEntity(world, level, desc, playerId);
  }

  // ── procedural generation ───────────────────────────────────────────────────

  _procedural(cx, cy) {
    const rng = this._rng(this._seedFor(cx, cy));
    const gx0 = cx * this.chunkCols;
    const gy0 = cy * this.chunkRows;
    const cc = this.chunkCols;
    const cr = this.chunkRows;
    const walls = [];
    const spawns = [];

    // Rock clusters (kinematic-solid wall rects). Kept off the chunk's 1-cell border so a
    // cluster never merges across a chunk seam or blocks a chunk entrance entirely.
    const rocks = 2 + Math.floor(rng() * 3); // 2..4
    for (let i = 0; i < rocks; i++) {
      const w = 1 + Math.floor(rng() * 2);
      const h = 1 + Math.floor(rng() * 2);
      const lx = 1 + Math.floor(rng() * (cc - 2 - w));
      const ly = 1 + Math.floor(rng() * (cr - 2 - h));
      walls.push([gx0 + lx, gy0 + ly, w, h]);
    }

    // Wandering slimes with light loot.
    const slimes = 1 + Math.floor(rng() * 3); // 1..3
    for (let i = 0; i < slimes; i++) {
      const lx = 1 + Math.floor(rng() * (cc - 2));
      const ly = 1 + Math.floor(rng() * (cr - 2));
      spawns.push({
        preset: "slime",
        gx: gx0 + lx,
        gy: gy0 + ly,
        hp: 3,
        loot: this._loot(rng),
      });
    }

    return { walls, spawns };
  }

  _loot(rng) {
    const loot = [{ itemId: "slime_gel", qty: 1 + Math.floor(rng() * 2) }];
    const roll = rng();
    if (roll > 0.85) loot.push({ itemId: "gem", qty: 1 });
    else if (roll > 0.6)
      loot.push({ itemId: "coin", qty: 1 + Math.floor(rng() * 3) });
    return loot;
  }

  // ── deterministic PRNG (xorshift32; bitwise ops are int32-safe on GMRT — IdPool uses them) ──

  // Fold (cx, cy, seed) into a 32-bit chunk seed.
  _seedFor(cx, cy) {
    let h = (this.seed ^ 0x9e3779b9) >>> 0;
    h = this._scramble((h ^ ((cx | 0) + 0x7f4a7c15)) >>> 0);
    h = this._scramble((h ^ ((cy | 0) + 0x6c62272e)) >>> 0);
    return h >>> 0;
  }

  _scramble(h) {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5;
    h >>>= 0;
    return h >>> 0;
  }

  // Returns a function yielding floats in [0, 1).
  _rng(seed) {
    let s = seed >>> 0;
    if (s === 0) s = 0x9e3779b9;
    return function () {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;
      s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }
};

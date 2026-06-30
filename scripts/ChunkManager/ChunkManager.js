// Chunk-streaming engine: windows a large/infinite world around a moving center so the World
// only holds entities near the player. Takes a `source` (content provider, e.g. ChunkSource)
// and drives EntitySnapshot capture/restore as chunks cross the rings. Plain instance class
// (GMRT doesn't fire static getters, so stateful singletons are instance classes).
//
// two-ring sim-LOD (Chebyshev chunk distance from the player's chunk):
//   d <= simRadius              → SIM:  entities live in the World, walls have colliders, sims + renders.
//   simRadius < d <= loadRadius → LOAD: entities held as EntitySnapshots (not simulated), drawn
//                                       statically by RenderChunks; walls drawn, no colliders.
//   d > loadRadius              → UNLOADED: snapshots parked in an in-session cache, restored on
//                                       return (so hurt/killed/moved entities persist).
//
// the party (player + followers) is never chunk-managed — only chunk-spawned content + terrain colliders.
//
// source contract:
//   source.generate(cx, cy) -> { walls: [[gx,gy,wCells,hCells]...]  (ABSOLUTE grid coords),
//                                solid?: [[gx,gy,wCells,hCells]...]  (collide-only rects, e.g. water — not drawn),
//                                spawns: [descriptor...],            (deterministic per cx,cy)
//                                terrain?: Int[]  per-cell material grid (cosmetic; TerrainStream) }
//   source.spawn(world, level, descriptor) -> entityId
//
// GMRT-safe: record maps walked via Object.keys + index loops (no Map/Set iteration).
globalThis.ChunkManager = class ChunkManager {
  /**
   * @param {World} world @param {Level} level
   * @param {Object} source generate(cx,cy) → {walls, spawns}; spawn(world, level, desc) → id.
   * @param {Object} [opts]
   * @param {number} [opts.chunkCols=16] @param {number} [opts.chunkRows=16] chunk size in cells.
   * @param {number} [opts.simRadius=1] @param {number} [opts.loadRadius=2] ring distances.
   * @param {number} [opts.worldCols] @param {number} [opts.worldRows] finite bounds (anchored at 0);
   *   chunks outside never load. omit both for unbounded.
   */
  constructor(world, level, source, opts = {}) {
    this.world = world;
    this.level = level;
    this.source = source;
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    this.simRadius = opts.simRadius ?? 1;
    this.loadRadius = opts.loadRadius ?? 2;

    // finite world bounds: chunks outside [0,worldCols)x[0,worldRows) never load. absent ⇒
    // unbounded. maxC* is the last in-bounds chunk index.
    this.maxCx =
      opts.worldCols !== undefined
        ? Math.floor((opts.worldCols - 1) / this.chunkCols)
        : Infinity;
    this.maxCy =
      opts.worldRows !== undefined
        ? Math.floor((opts.worldRows - 1) / this.chunkRows)
        : Infinity;

    this.cellW = level.cellWidth;
    this.cellH = level.cellHeight;
    this.pxW = this.chunkCols * this.cellW; // chunk pixel width
    this.pxH = this.chunkRows * this.cellH;

    // active chunks keyed "cx,cy" → { cx, cy, ring, walls, terrain, colliders, entities, snapshots }
    this._chunks = {};
    // snapshots of unloaded chunks, keyed "cx,cy"; restored on revisit so modified entities persist.
    // unbounded for now; eviction / disk-backing is the follow-up.
    this._cache = {};
    // last player chunk — fast-path skips the diff until a border is crossed
    this._pcx = undefined;
    this._pcy = undefined;

    this.stats = { loaded: 0, unloaded: 0, promoted: 0, demoted: 0 };
  }

  /** drop refs; the World owns the entities/colliders and frees them itself */
  destroy() {
    this._chunks = {};
    this._cache = {};
  }

  _key(cx, cy) {
    return cx + "," + cy;
  }
  chunkX(wx) {
    return Math.floor(wx / this.pxW);
  }
  chunkY(wy) {
    return Math.floor(wy / this.pxH);
  }

  /**
   * Stream around a center — call once per frame, OUTSIDE the tick loop. Returns early until
   * the center crosses into a new chunk (membership only changes then).
   * @param {number} centerX @param {number} centerY usually the player.
   */
  update(centerX, centerY) {
    const pcx = this.chunkX(centerX);
    const pcy = this.chunkY(centerY);
    if (pcx === this._pcx && pcy === this._pcy) return;
    this._pcx = pcx;
    this._pcy = pcy;

    const lr = this.loadRadius;

    // 1. unload chunks beyond the load radius (snapshot any sim entities first)
    const keys = Object.keys(this._chunks);
    for (let i = 0; i < keys.length; i++) {
      const rec = this._chunks[keys[i]];
      const d = Math.max(Math.abs(rec.cx - pcx), Math.abs(rec.cy - pcy));
      if (d > lr) this._unload(keys[i], rec);
    }

    // 2. load new chunks in range + retier chunks whose ring changed
    for (let dy = -lr; dy <= lr; dy++) {
      for (let dx = -lr; dx <= lr; dx++) {
        const cheb = Math.max(Math.abs(dx), Math.abs(dy));
        const ring = cheb <= this.simRadius ? "sim" : "load";
        const cx = pcx + dx;
        const cy = pcy + dy;
        // skip out-of-bounds chunks (no-op when unbounded — maxC* = Infinity)
        if (cx < 0 || cy < 0 || cx > this.maxCx || cy > this.maxCy) continue;
        const key = this._key(cx, cy);
        const rec = this._chunks[key];
        if (rec === undefined) this._load(key, cx, cy, ring);
        else if (rec.ring !== ring) {
          if (ring === "sim") this._promote(rec);
          else this._demote(rec);
        }
      }
    }

    // 3. commit our removals so demoted/unloaded entities aren't double-drawn this frame
    this.world.flush();
  }

  /** @returns {Object[]} active chunk records (fresh array, for RenderChunks) */
  records() {
    const out = [];
    const keys = Object.keys(this._chunks);
    for (let i = 0; i < keys.length; i++) out.push(this._chunks[keys[i]]);
    return out;
  }

  /** @returns {number} active (sim + load ring) chunk count */
  activeCount() {
    return Object.keys(this._chunks).length;
  }

  /** @returns {{cx:number,cy:number}} player's chunk (undefined before first update) */
  centerChunk() {
    return { cx: this._pcx, cy: this._pcy };
  }

  // internal lifecycle

  // Generate (or restore from cache) a chunk at `ring`. Walls come from the deterministic source
  // (terrain regenerates identically); only entities are cached, so a revisit keeps modified state.
  _load(key, cx, cy, ring) {
    const gen = this.source.generate(cx, cy);
    const rec = {
      cx,
      cy,
      ring,
      walls: gen.walls, // [[gx,gy,w,h]...] absolute coords — mesh + render
      solid: gen.solid ?? [], // collide-only rects — meshed, NOT rendered
      terrain: gen.terrain, // per-cell material grid — TerrainStream renders it
      colliders: [],
      entities: [],
      snapshots: [],
    };
    const cached = this._cache[key];
    if (cached !== undefined) delete this._cache[key];

    if (ring === "sim") {
      this._meshColliders(rec);
      if (cached !== undefined) this._restoreAll(rec, cached);
      else this._spawnAll(rec, gen.spawns);
    } else {
      // load (freeze) ring: hold entities as snapshots, no colliders
      if (cached !== undefined) {
        rec.snapshots = cached;
      } else {
        // fresh: spawn (sets CombatAI's shared statics), then capture + remove to stay out of the World
        this._spawnAll(rec, gen.spawns);
        this._captureAll(rec);
      }
    }
    this._chunks[key] = rec;
    this.stats.loaded++;
  }

  // load → sim: restore entities into the World + mesh wall/terrain colliders
  _promote(rec) {
    this._meshColliders(rec);
    this._restoreAll(rec, rec.snapshots);
    rec.snapshots = [];
    rec.ring = "sim";
    this.stats.promoted++;
  }

  // sim → load: snapshot live entities out of the World + drop colliders
  _demote(rec) {
    this._captureAll(rec);
    this._dropColliders(rec);
    rec.ring = "load";
    this.stats.demoted++;
  }

  // beyond load radius: snapshot live entities, drop colliders, park snapshots in cache
  _unload(key, rec) {
    if (rec.ring === "sim") {
      this._captureAll(rec);
      this._dropColliders(rec);
    }
    this._cache[key] = rec.snapshots;
    delete this._chunks[key];
    this.stats.unloaded++;
  }

  // entity/collider helpers

  // one kinematic-solid collider per wall + solid rect (source already groups cells into rects).
  // matches TileEdit.meshSolid: Position at rect top-left, BBox (0,0) spanning it.
  _meshColliders(rec) {
    this._meshRects(rec, rec.walls);
    this._meshRects(rec, rec.solid);
  }

  _meshRects(rec, rects) {
    if (rects === undefined) return;
    const cw = this.cellW;
    const ch = this.cellH;
    const world = this.world;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const id = world.create();
      world.add(id, Position, { x: r[0] * cw, y: r[1] * ch, z: 0 });
      world.add(id, BBox, {
        x: 0,
        y: 0,
        width: r[2] * cw,
        height: r[3] * ch,
      });
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      rec.colliders.push(id);
    }
  }

  _dropColliders(rec) {
    for (let i = 0; i < rec.colliders.length; i++)
      this.world.remove(rec.colliders[i]);
    rec.colliders = [];
  }

  _spawnAll(rec, spawns) {
    for (let i = 0; i < spawns.length; i++) {
      const id = this.source.spawn(this.world, this.level, spawns[i]);
      if (id !== undefined && id !== -1) rec.entities.push(id);
    }
  }

  _restoreAll(rec, snapshots) {
    for (let i = 0; i < snapshots.length; i++)
      rec.entities.push(EntitySnapshot.restore(this.world, snapshots[i]));
  }

  // entities → snapshots, removing each from the World. skips invalid ids (e.g. killed enemies) so the dead stay dead.
  _captureAll(rec) {
    const snaps = [];
    for (let i = 0; i < rec.entities.length; i++) {
      const id = rec.entities[i];
      if (!this.world.isValid(id)) continue;
      snaps.push(EntitySnapshot.capture(this.world, id));
      this.world.remove(id);
    }
    rec.entities = [];
    rec.snapshots = snaps;
  }
};

// Chunk-streaming engine: windows a large/infinite world around a moving center so the World
// only holds entities near the player. Takes a `source` (content provider, e.g. ChunkSource)
// and drives EntitySnapshot capture/restore as chunks cross the rings. Plain instance class
// (GMRT doesn't fire static getters, so stateful singletons are instance classes).
//
// two-ring sim-LOD (Chebyshev chunk distance from the player's chunk):
//   d <= simRadius              → SIM:  entities live in the World, walls have colliders, sims + renders.
//   simRadius < d <= loadRadius → LOAD: walls drawn (no colliders). entities are held as frozen
//                                       EntitySnapshots ONCE they've been sim'd (drawn statically by
//                                       RenderChunks); a chunk not yet reached keeps only dormant
//                                       spawn DESCRIPTORS and does no World work until it promotes.
//   d > loadRadius              → UNLOADED: the WHOLE record (terrain/walls/spawns/snapshots) is
//                                       parked in an in-session cache, restored on return — so a
//                                       revisit never re-runs generate() and modified entities persist.
//
// fresh LOAD-ring loads (generate() is noise-heavy) are queued + drained loadBudget/frame, so a
// border crossing doesn't generate a whole ring in one frame.
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
   * @param {ECS} world @param {LevelGrid} level
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

    this.loadBudget = opts.loadBudget ?? 2; // fresh LOAD-ring chunks generated per frame (amortized)

    // active chunks keyed "cx,cy" → record { cx, cy, ring, walls, solid, terrain, spawns,
    //   colliders, entities, snapshots, hydrated }
    this._chunks = {};
    // WHOLE records of unloaded chunks, keyed "cx,cy"; restored on revisit so a chunk never
    // re-runs generate() (its terrain/walls/spawns are kept) and modified entities persist.
    // unbounded for now; eviction / disk-backing is the follow-up.
    this._cache = {};
    // deferred fresh LOAD-ring loads (generate() is noise-heavy), drained loadBudget/frame so a
    // border crossing doesn't generate a whole ring in one frame. FIFO of {cx,cy}.
    this._loadQueue = [];
    // last player chunk — fast-path skips the membership diff until a border is crossed
    this._pcx = undefined;
    this._pcy = undefined;

    this.stats = { loaded: 0, unloaded: 0, promoted: 0, demoted: 0 };
  }

  /** drop refs; the World owns the entities/colliders and frees them itself */
  destroy() {
    this._chunks = {};
    this._cache = {};
    this._loadQueue = [];
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
    const moved = pcx !== this._pcx || pcy !== this._pcy;
    this._pcx = pcx;
    this._pcy = pcy;

    if (moved) {
      const lr = this.loadRadius;

      // 1. unload chunks beyond the load radius (snapshot any sim entities first)
      const keys = Object.keys(this._chunks);
      for (let i = 0; i < keys.length; i++) {
        const rec = this._chunks[keys[i]];
        const d = Math.max(Math.abs(rec.cx - pcx), Math.abs(rec.cy - pcy));
        if (d > lr) this._unload(keys[i], rec);
      }

      // 2. membership diff. SIM chunks load NOW (the player is on/next to them); fresh LOAD chunks
      //    are QUEUED (off-screen, so their generate() can amortize). Rebuilt each crossing, which
      //    prunes any still-pending entries that fell out of range.
      this._loadQueue.length = 0;
      for (let dy = -lr; dy <= lr; dy++) {
        for (let dx = -lr; dx <= lr; dx++) {
          const cheb = Math.max(Math.abs(dx), Math.abs(dy));
          const ring = cheb <= this.simRadius ? "sim" : "load";
          const cx = pcx + dx;
          const cy = pcy + dy;
          // skip out-of-bounds chunks (no-op when unbounded — maxC* = Infinity)
          if (cx < 0 || cy < 0 || cx > this.maxCx || cy > this.maxCy) continue;
          const rec = this._chunks[this._key(cx, cy)];
          if (rec === undefined) {
            if (ring === "sim") this._activate(this._recordFor(cx, cy, "sim"));
            else this._loadQueue.push({ cx, cy });
          } else if (rec.ring !== ring) {
            if (ring === "sim") this._promote(rec);
            else this._demote(rec);
          }
        }
      }

      // 3. commit removals so demoted/unloaded entities aren't double-drawn this frame
      this.world.flush();
    }

    // drain a few queued LOAD-ring loads each frame (does no World mutation — no flush needed)
    this._drainQueue();
  }

  // Load up to loadBudget queued fresh LOAD-ring chunks (holds descriptors, no World work — they
  // materialize on promotion to SIM). Runs every frame so the ring fills over the frames after a crossing.
  _drainQueue() {
    let budget = this.loadBudget;
    while (budget > 0 && this._loadQueue.length > 0) {
      const c = this._loadQueue.shift();
      if (this._chunks[this._key(c.cx, c.cy)] !== undefined) continue; // already loaded
      this._activate(this._recordFor(c.cx, c.cy, "load"));
      budget--;
    }
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

  // A chunk's entity state has three forms: DESCRIPTORS (rec.spawns, not yet materialized —
  // hydrated:false), LIVE (rec.entities in the World — SIM ring), or SNAPSHOTS (rec.snapshots,
  // frozen — LOAD ring after a demote). `hydrated` marks "descriptors have become live/snapshots
  // at least once", so we never spawn a chunk we don't sim, and never re-run generate() (whole
  // records are cached).

  // Fetch a chunk record: reuse the cached whole record (skips generate()), else generate fresh
  // with its spawn DESCRIPTORS held dormant. Does not populate the World — see _activate.
  _recordFor(cx, cy, ring) {
    const key = this._key(cx, cy);
    const cached = this._cache[key];
    if (cached !== undefined) {
      delete this._cache[key];
      cached.ring = ring;
      cached.colliders = []; // were dropped on unload
      return cached;
    }
    const gen = this.source.generate(cx, cy);
    return {
      cx,
      cy,
      ring,
      walls: gen.walls, // [[gx,gy,w,h]...] absolute coords — mesh + render
      solid: gen.solid ?? [], // collide-only rects — meshed, NOT rendered
      terrain: gen.terrain, // per-cell material grid — TerrainStream renders it
      spawns: gen.spawns ?? [], // dormant descriptors until first sim (hydrated:false)
      colliders: [],
      entities: [],
      snapshots: [],
      hydrated: false,
    };
  }

  // Populate a fresh record into its ring + register it. SIM meshes colliders + materializes
  // entities (from snapshots if seen before, else from descriptors); LOAD holds whatever it has
  // (snapshots if hydrated, else dormant descriptors — no World work, so distant rings are cheap).
  _activate(rec) {
    if (rec.ring === "sim") this._materialize(rec);
    this._chunks[this._key(rec.cx, rec.cy)] = rec;
    this.stats.loaded++;
  }

  // Bring a record's entities into the World + mesh its colliders (SIM ring). Restores snapshots if
  // the chunk has lived before, else spawns its descriptors for the first time.
  _materialize(rec) {
    this._meshColliders(rec);
    if (rec.hydrated) {
      this._restoreAll(rec, rec.snapshots);
      rec.snapshots = [];
    } else {
      this._spawnAll(rec, rec.spawns);
      rec.hydrated = true;
    }
  }

  // load → sim
  _promote(rec) {
    this._materialize(rec);
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

  // beyond load radius: snapshot live entities, drop colliders, park the WHOLE record in cache
  // (so a revisit skips generate() and keeps modified entity state)
  _unload(key, rec) {
    if (rec.ring === "sim") {
      this._captureAll(rec);
      this._dropColliders(rec);
    }
    this._cache[key] = rec;
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

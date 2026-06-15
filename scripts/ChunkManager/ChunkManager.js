// Core chunk-streaming engine: windows a large/infinite world around a moving center so the
// World only ever holds the entities near the player. Genre-agnostic — it takes a `source`
// (the content provider, e.g. RPG's ChunkSource) and drives EntitySnapshot capture/restore
// as chunks cross the streaming rings. One instance per chunked map, owned by the scene
// (`this.chunks`), mirroring SceneManager being a plain instance class (GMRT doesn't fire
// static getters, so singletons-with-state are instance classes).
//
// Two-ring sim-LOD (Chebyshev chunk distance from the player's chunk):
//   d <= simRadius              → SIM ring:  entities live in the World, walls have colliders,
//                                            everything simulates + renders normally.
//   simRadius < d <= loadRadius → LOAD ring: entities held as EntitySnapshots (NOT in the
//                                            World, not simulated), drawn statically by
//                                            RenderChunks; walls drawn but no colliders.
//   d > loadRadius              → UNLOADED:  snapshots moved to an in-session cache, restored
//                                            on return (so hurt/killed/moved entities persist).
//
// The party (player + followers) is never chunk-managed — the scene keeps it in the World
// always; this only owns chunk-spawned content (enemies, props, chests, items, NPCs, portals)
// and the terrain colliders.
//
// Source contract:
//   source.generate(cx, cy) -> { walls: [[gx,gy,wCells,hCells]...]  (ABSOLUTE grid coords),
//                                spawns: [descriptor...] }            (deterministic per cx,cy)
//   source.spawn(world, level, descriptor, playerId) -> entityId      (constructs one entity)
//
// GMRT-safe: plain-object record maps walked via Object.keys + index loops (no Map/Set
// iteration), index loops throughout, class assigned to globalThis.
globalThis.ChunkManager = class ChunkManager {
  constructor(world, level, source, opts = {}) {
    this.world = world;
    this.level = level;
    this.source = source;
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    this.simRadius = opts.simRadius ?? 1;
    this.loadRadius = opts.loadRadius ?? 2;
    this.playerId = opts.playerId ?? -1;

    // Optional finite world bounds (cells, anchored at cell 0). When set, chunks outside the
    // [0,worldCols)x[0,worldRows) rectangle never load — the world stops being infinite. Absent ⇒
    // unbounded (interiors / other maps unchanged). maxC* is the last in-bounds chunk index.
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

    // Active chunks keyed "cx,cy" → { cx, cy, ring, walls, colliders, entities, snapshots }.
    this._chunks = {};
    // Snapshots of unloaded (previously-visited) chunks, keyed "cx,cy". Restored on revisit so
    // a chunk's modified entities persist for the session. Unbounded for now (snapshots are
    // small); eviction / disk-backing is the follow-up.
    this._cache = {};
    // Last player chunk — the per-frame fast path skips the whole diff until a border is crossed.
    this._pcx = undefined;
    this._pcy = undefined;

    // Telemetry for the verify harness + a debug HUD.
    this.stats = { loaded: 0, unloaded: 0, promoted: 0, demoted: 0 };
  }

  destroy() {
    // The World owns the entities/colliders (destroyed with it); just drop our refs.
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

  // Stream around (centerX, centerY) — call once per frame, OUTSIDE the tick loop. Returns
  // early until the center crosses into a new chunk (chunk membership only changes then).
  update(centerX, centerY) {
    const pcx = this.chunkX(centerX);
    const pcy = this.chunkY(centerY);
    if (pcx === this._pcx && pcy === this._pcy) return;
    this._pcx = pcx;
    this._pcy = pcy;

    const lr = this.loadRadius;

    // 1. Unload chunks that fell outside the load radius (snapshot any sim entities first).
    const keys = Object.keys(this._chunks);
    for (let i = 0; i < keys.length; i++) {
      const rec = this._chunks[keys[i]];
      const d = Math.max(Math.abs(rec.cx - pcx), Math.abs(rec.cy - pcy));
      if (d > lr) this._unload(keys[i], rec);
    }

    // 2. Load new chunks in range + retier chunks whose ring changed.
    for (let dy = -lr; dy <= lr; dy++) {
      for (let dx = -lr; dx <= lr; dx++) {
        const cheb = Math.max(Math.abs(dx), Math.abs(dy));
        const ring = cheb <= this.simRadius ? "sim" : "load";
        const cx = pcx + dx;
        const cy = pcy + dy;
        // Skip chunks outside the finite world (no-op when unbounded — maxC* = Infinity).
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

    // 3. Commit removals queued above so the demoted/unloaded entities aren't double-drawn
    //    this frame (the tick loop already flushed; this just commits our own removals).
    this.world.flush();
  }

  // Active chunk records as a fresh array (for RenderChunks). Object.keys is GMRT-safe.
  records() {
    const out = [];
    const keys = Object.keys(this._chunks);
    for (let i = 0; i < keys.length; i++) out.push(this._chunks[keys[i]]);
    return out;
  }

  activeCount() {
    return Object.keys(this._chunks).length;
  }

  // ── internal lifecycle ─────────────────────────────────────────────────────

  // Generate (or restore from cache) a chunk and install it at `ring`. Walls always come from
  // the deterministic source (not cached — terrain regenerates identically); only entities are
  // cached, so a revisited chunk keeps its modified entity state.
  _load(key, cx, cy, ring) {
    const gen = this.source.generate(cx, cy);
    const rec = {
      cx,
      cy,
      ring,
      walls: gen.walls, // [[gx,gy,w,h]...] absolute grid coords — for mesh + render
      colliders: [],
      entities: [],
      snapshots: [],
    };
    const cached = this._cache[key];
    if (cached !== undefined) delete this._cache[key];

    if (ring === "sim") {
      this._meshWalls(rec);
      if (cached !== undefined) this._restoreAll(rec, cached);
      else this._spawnAll(rec, gen.spawns);
    } else {
      // Load (freeze) ring: hold entities as snapshots, no colliders.
      if (cached !== undefined) {
        rec.snapshots = cached;
      } else {
        // Fresh content: spawn (also sets SlimeAI's shared world/target statics), then capture
        // + remove so the freeze ring stays out of the World.
        this._spawnAll(rec, gen.spawns);
        this._captureAll(rec);
      }
    }
    this._chunks[key] = rec;
    this.stats.loaded++;
  }

  // load → sim: bring the chunk's entities into the World and give its walls colliders.
  _promote(rec) {
    this._meshWalls(rec);
    this._restoreAll(rec, rec.snapshots);
    rec.snapshots = [];
    rec.ring = "sim";
    this.stats.promoted++;
  }

  // sim → load: snapshot the chunk's live entities out of the World and drop its colliders.
  _demote(rec) {
    this._captureAll(rec);
    this._dropColliders(rec);
    rec.ring = "load";
    this.stats.demoted++;
  }

  // Beyond load radius: snapshot any live entities, drop colliders, park snapshots in the cache.
  _unload(key, rec) {
    if (rec.ring === "sim") {
      this._captureAll(rec);
      this._dropColliders(rec);
    }
    this._cache[key] = rec.snapshots;
    delete this._chunks[key];
    this.stats.unloaded++;
  }

  // ── entity/collider helpers ────────────────────────────────────────────────

  // One kinematic-solid collider per wall rect (the source already groups cells into rects, so
  // no greedy meshing). Matches TileEdit.meshSolid's convention: Position at the rect's
  // top-left corner, BBox offset (0,0) spanning the rect.
  _meshWalls(rec) {
    const cw = this.cellW;
    const ch = this.cellH;
    const world = this.world;
    for (let i = 0; i < rec.walls.length; i++) {
      const r = rec.walls[i];
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
      const id = this.source.spawn(
        this.world,
        this.level,
        spawns[i],
        this.playerId,
      );
      if (id !== undefined && id !== -1) rec.entities.push(id);
    }
  }

  _restoreAll(rec, snapshots) {
    for (let i = 0; i < snapshots.length; i++)
      rec.entities.push(EntitySnapshot.restore(this.world, snapshots[i]));
  }

  // entities → snapshots, removing each from the World (deferred until flush). Skips ids no
  // longer valid (e.g. a slime killed while the chunk was simulated) so the dead stay dead.
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

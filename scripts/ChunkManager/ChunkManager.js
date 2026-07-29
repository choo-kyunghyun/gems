// Chunk-streaming engine: windows a large/infinite world around a moving center so the store only
// holds entities near the player. Model + generator contract on the ChunkManager declaration below.
/**
 * Takes a `generator` (content provider — a ChunkGenerator, or anything matching the contract below)
 * plus an injected `opts.spawn` adapter for descriptors, and drives EntitySnapshot capture/restore as
 * chunks cross the rings.
 *
 * two-ring sim-LOD (Chebyshev chunk distance from the player's chunk):
 *   d <= simRadius              → SIM:  entities live in the store, walls have colliders, sims + renders.
 *   simRadius < d <= loadRadius → LOAD: walls drawn (no colliders). entities are held as frozen
 *                                       EntitySnapshots ONCE they've been sim'd (drawn statically by
 *                                       RenderChunks); a chunk not yet reached keeps only dormant
 *                                       spawn DESCRIPTORS and does no store work until it promotes.
 *   d > loadRadius              → UNLOADED: the WHOLE record (terrain/walls/spawns/snapshots) is
 *                                       parked in an in-session cache, restored on return — so a
 *                                       revisit never re-runs generate() and modified entities persist.
 *
 * pregenerate() (finite worlds) generates EVERY in-bounds chunk into that cache at map build, making
 * the cache the world STORE: mid-game streaming is then pure load/unload — generate() never runs
 * during play, and materialAt/costAt read stored terrain instead of re-sampling noise (TerrainStream
 * apron, NavGrid weights, PathFollow pricing). A non-pregenerated chunk still generates lazily on
 * first load (a fallback, unamortized).
 *
 * The squad (player + hired companions) is never chunk-managed — only chunk-spawned content + terrain
 * colliders.
 *
 * generator contract (ChunkGenerator satisfies it):
 *   generator.generate(cx, cy) -> { walls: [[gx,gy,wCells,hCells]...]  (ABSOLUTE grid coords),
 *                                   solid?: [[gx,gy,wCells,hCells]...]  (collide-only rects, e.g. water — not drawn),
 *                                   spawns: [descriptor...],            (deterministic per cx,cy)
 *                                   terrain?: Int[]  per-cell material grid (cosmetic; TerrainStream) }
 *   generator.palette  (field, optional) — material table (pathCost per id; costAt + TerrainStream)
 *   generator.materialAt / costAt (optional) — pure samplers, the out-of-store fallback
 *   opts.spawn(entities, grid, descriptor) -> entityId  — the descriptor adapter (e.g. wraps
 *     RpgSpawn.spawnEntity); required only when chunks carry spawns
 * GMRT-safe: record maps walked via Object.keys + index loops (no Map/Set iteration).
 */
globalThis.ChunkManager = class ChunkManager {
  /**
   * @param {Entity} entities
   * @param {LevelGrid} grid
   * @param {Object} generator generate(cx,cy) → {terrain, solid, walls, spawns} (see contract above).
   * @param {Object} [opts] spawn (descriptor → entity adapter), chunkCols/chunkRows (cell size, default
   *   16), simRadius/loadRadius (ring distances, default 1/2), worldCols/worldRows (finite bounds
   *   anchored at 0 — chunks outside never load; omit both for unbounded).
   */
  constructor(entities, grid, generator, opts = {}) {
    this.entities = entities;
    this.grid = grid;
    this.generator = generator;
    this._spawn = opts.spawn ?? null;
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

    this.cellW = grid.cellWidth;
    this.cellH = grid.cellHeight;
    this.pxW = this.chunkCols * this.cellW; // chunk pixel width
    this.pxH = this.chunkRows * this.cellH;

    // material table for the store-backed costAt (mirrors TerrainField's pathCost mapping);
    // absent on a palette-less generator → costAt delegates to the generator
    this._palette = generator.palette;

    // active chunks keyed "cx,cy" → record { cx, cy, ring, walls, solid, terrain, spawns,
    //   colliders, entities, snapshots, hydrated }
    this._chunks = {};
    // WHOLE records of unloaded chunks, keyed "cx,cy"; restored on revisit so a chunk never
    // re-runs generate() (its terrain/walls/spawns are kept) and modified entities persist.
    // pregenerate() fills it for every in-bounds chunk up front — the world STORE.
    // exportCache/importCache carry the touched-chunk delta into a save (SaveGame's maps pass);
    // untouched chunks are omitted — they regenerate from the seed.
    this._cache = {};
    // last player chunk — fast-path skips the membership diff until a border is crossed
    this._pcx = undefined;
    this._pcy = undefined;

    this.stats = { loaded: 0, unloaded: 0, promoted: 0, demoted: 0 };
  }

  /** drop refs; the store owns the entities/colliders and frees them itself */
  destroy() {
    this._chunks = {};
    this._cache = {};
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @returns {string}
   */
  _key(cx, cy) {
    return cx + "," + cy;
  }
  /**
   * @param {number} wx
   * @returns {number}
   */
  chunkX(wx) {
    return Math.floor(wx / this.pxW);
  }
  /**
   * @param {number} wy
   * @returns {number}
   */
  chunkY(wy) {
    return Math.floor(wy / this.pxH);
  }

  /**
   * Stream around a center — call once per frame, OUTSIDE the tick loop. Returns early until
   * the center crosses into a new chunk (membership only changes then).
   * @param {number} centerX
   * @param {number} centerY usually the player.
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

      // 2. membership diff — the whole ring loads NOW. With a pregenerated store a load is a
      //    cache move (no generate()), and a LOAD-ring record does no store work anyway (its
      //    descriptors stay dormant until it promotes to SIM), so nothing needs amortizing.
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
            this._activate(this._recordFor(cx, cy, ring));
          } else if (rec.ring !== ring) {
            if (ring === "sim") this._promote(rec);
            else this._demote(rec);
          }
        }
      }

      // 3. commit removals so demoted/unloaded entities aren't double-drawn this frame
      this.entities.flush();
    }
  }

  /**
   * Whole-world WALL occupancy as a read-only layer view (`{ get(gx, gy) → bool }`, absolute
   * cells) — the `layer` a RenderWalls pass takes, so streamed/authored walls draw as the same
   * lit boxes as a resident wall TileLayer. Requires the pregenerated store (finite bounds):
   * after pregenerate() the records ARE the whole world and walls never change in-session, so
   * the cell set is rasterized ONCE on first get() and cached for the manager's lifetime.
   * (`solid` rects — water — are collide-only and stay excluded, exactly like RenderChunks.)
   * @returns {{_cells: Object<string, boolean>|null, get: function(number, number): boolean}}
   */
  wallLayer() {
    if (this.maxCx === Infinity || this.maxCy === Infinity)
      throw new Error(
        "ChunkManager.wallLayer needs the pregenerated store (finite worldCols/worldRows)",
      );
    const mgr = this;
    return {
      _cells: null,
      /**
       * @param {number} gx
       * @param {number} gy
       * @returns {boolean}
       */
      get(gx, gy) {
        if (this._cells === null) this._cells = mgr._rasterizeWalls();
        return this._cells[gx + "," + gy] === true;
      },
    };
  }

  /**
   * every record's wall rects (active + cached — the whole world after pregenerate())
   * rasterized into a cell-occupancy map "gx,gy" → true
   * @returns {Object<string, boolean>}
   */
  _rasterizeWalls() {
    const cells = {};
    const put = (rec) => {
      const walls = rec.walls;
      for (let i = 0; i < walls.length; i++) {
        const r = walls[i];
        for (let dy = 0; dy < r[3]; dy++)
          for (let dx = 0; dx < r[2]; dx++)
            cells[r[0] + dx + "," + (r[1] + dy)] = true;
      }
    };
    let keys = Object.keys(this._chunks);
    for (let i = 0; i < keys.length; i++) put(this._chunks[keys[i]]);
    keys = Object.keys(this._cache);
    for (let i = 0; i < keys.length; i++) put(this._cache[keys[i]]);
    return cells;
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

  // ── disk persistence (the "deep" save) ──
  // walls/solid/terrain/spawns are DETERMINISTIC from the seed (pregenerate regenerates them
  // identically), so a save serializes only the ENTITY-STATE DELTA of chunks that have been
  // touched: which mobs are dead/moved/hurt, what loot dropped. Untouched (hydrated:false) chunks
  // are skipped entirely — they come back from generate(). Import runs after pregenerate(), before
  // the first stream, so each restored chunk materializes its saved snapshots instead of fresh spawns.

  /**
   * Every live SIM-ring entity id the manager owns — the caller excludes these from its own store
   * export so they aren't saved twice (they ride the chunk cache instead).
   * @returns {number[]}
   */
  entityIds() {
    const out = [];
    const keys = Object.keys(this._chunks);
    for (let i = 0; i < keys.length; i++) {
      const ents = this._chunks[keys[i]].entities;
      for (let j = 0; j < ents.length; j++) out.push(ents[j]);
    }
    return out;
  }

  /**
   * Serialize the entity-state delta of every hydrated chunk (active + cached). A SIM chunk's live
   * entities are captured NON-destructively (the game continues); a demoted/cached chunk already
   * holds snapshots. `exclude` drops runtime-rebuilt components (PrevPosition/Path*) from each
   * snapshot. A hydrated chunk with zero entities is still recorded (the player cleared it — it must
   * stay clear on load, not repopulate from seed).
   * @param {string[]} [exclude] component tokens to omit
   * @returns {{cx:number,cy:number,snaps:Object[]}[]}
   */
  exportCache(exclude = []) {
    const filtered = (comps) => {
      const out = {};
      const toks = Object.keys(comps);
      for (let i = 0; i < toks.length; i++)
        if (exclude.indexOf(toks[i]) === -1) out[toks[i]] = comps[toks[i]];
      return out;
    };
    const out = [];
    const grab = (rec) => {
      if (!rec.hydrated) return; // untouched → regenerates identically
      const snaps = [];
      if (rec.ring === "sim") {
        for (let i = 0; i < rec.entities.length; i++)
          if (this.entities.isValid(rec.entities[i]))
            snaps.push({
              components: filtered(this.entities.componentsOf(rec.entities[i])),
            });
      } else {
        for (let i = 0; i < rec.snapshots.length; i++)
          snaps.push({ components: filtered(rec.snapshots[i].components) });
      }
      out.push({ cx: rec.cx, cy: rec.cy, snaps });
    };
    let keys = Object.keys(this._chunks);
    for (let i = 0; i < keys.length; i++) grab(this._chunks[keys[i]]);
    keys = Object.keys(this._cache);
    for (let i = 0; i < keys.length; i++) grab(this._cache[keys[i]]);
    return out;
  }

  /**
   * Overwrite the pregenerated cache with a saved entity-state delta — call AFTER pregenerate() and
   * BEFORE the first update(), so each saved chunk materializes its snapshots (not fresh spawns).
   * Chunks absent from the save keep their generated spawns (untouched terrain, unmet mobs).
   * @param {{cx:number,cy:number,snaps:Object[]}[]} list
   */
  importCache(list) {
    if (list === undefined) return;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const key = this._key(e.cx, e.cy);
      const rec = this._chunks[key] ?? this._cache[key];
      if (rec === undefined) continue; // out of bounds / not pregenerated
      rec.snapshots = e.snaps;
      rec.entities = [];
      rec.hydrated = true; // _materialize now restores snapshots instead of spawning descriptors
    }
  }

  // internal lifecycle

  // A chunk's entity state has three forms: DESCRIPTORS (rec.spawns, not yet materialized —
  // hydrated:false), LIVE (rec.entities in the store — SIM ring), or SNAPSHOTS (rec.snapshots,
  // frozen — LOAD ring after a demote). `hydrated` marks "descriptors have become live/snapshots
  // at least once", so we never spawn a chunk we don't sim, and never re-run generate() (whole
  // records are cached).

  /**
   * Fetch a chunk record: reuse the cached whole record (skips generate() — always the case
   * after pregenerate()), else generate fresh with its spawn DESCRIPTORS held dormant. Does not
   * populate the store — see _activate.
   * @param {number} cx
   * @param {number} cy
   * @param {string} ring
   * @returns {Object}
   */
  _recordFor(cx, cy, ring) {
    const key = this._key(cx, cy);
    const cached = this._cache[key];
    if (cached !== undefined) {
      delete this._cache[key];
      cached.ring = ring;
      cached.colliders = []; // were dropped on unload
      return cached;
    }
    const rec = this._freshRecord(cx, cy);
    rec.ring = ring;
    return rec;
  }

  /**
   * run generate() and wrap its output in a dormant record (ring set by the caller)
   * @param {number} cx
   * @param {number} cy
   * @returns {Object}
   */
  _freshRecord(cx, cy) {
    const gen = this.generator.generate(cx, cy);
    return {
      cx,
      cy,
      ring: "load",
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

  /**
   * Generate EVERY in-bounds chunk into the whole-record cache NOW (map build time, behind the
   * level fade) — the "generate the level once, then only load/unload" model: after this,
   * mid-game streaming never runs generate(), and the samplers below read stored terrain.
   * Idempotent — chunks already active or cached keep their (possibly modified) records, so a
   * resume/second call can't wipe live state. Requires finite world bounds.
   * @returns {number} chunks generated
   */
  pregenerate() {
    if (this.maxCx === Infinity || this.maxCy === Infinity)
      throw new Error(
        "ChunkManager.pregenerate needs finite bounds (worldCols/worldRows)",
      );
    let n = 0;
    for (let cy = 0; cy <= this.maxCy; cy++) {
      for (let cx = 0; cx <= this.maxCx; cx++) {
        const key = this._key(cx, cy);
        if (this._cache[key] !== undefined || this._chunks[key] !== undefined)
          continue;
        this._cache[key] = this._freshRecord(cx, cy);
        n++;
      }
    }
    return n;
  }

  // store-backed terrain samplers — read the material a cell was GENERATED with (active or
  // cached record) instead of re-sampling the generator's noise; out-of-store coords (e.g. the
  // render apron past the world edge) fall back to the generator's pure sampler.

  /**
   * @param {number} ax
   * @param {number} ay
   * @returns {number} material id at an absolute cell
   */
  materialAt(ax, ay) {
    const m = this._storedMaterial(ax, ay);
    if (m !== undefined) return m;
    return this.generator.materialAt !== undefined
      ? this.generator.materialAt(ax, ay)
      : 0;
  }

  /**
   * @param {number} ax
   * @param {number} ay
   * @returns {number} movement cost at an absolute cell (1 = easy … Infinity = impassable)
   */
  costAt(ax, ay) {
    const m = this._storedMaterial(ax, ay);
    if (m !== undefined && this._palette !== undefined) {
      const c = this._palette[m].pathCost; // mirrors TerrainField.costAt's mapping
      return c === null ? Infinity : c;
    }
    return this.generator.costAt !== undefined
      ? this.generator.costAt(ax, ay)
      : 1;
  }

  /**
   * stored material id at an absolute cell, or undefined when the chunk (or its terrain) isn't held
   * @param {number} ax
   * @param {number} ay
   * @returns {number|undefined}
   */
  _storedMaterial(ax, ay) {
    const cx = Math.floor(ax / this.chunkCols);
    const cy = Math.floor(ay / this.chunkRows);
    const key = this._key(cx, cy);
    const rec = this._chunks[key] ?? this._cache[key];
    if (rec === undefined || rec.terrain === undefined) return undefined;
    const lx = ax - cx * this.chunkCols;
    const ly = ay - cy * this.chunkRows;
    return rec.terrain[ly * this.chunkCols + lx];
  }

  /**
   * Populate a fresh record into its ring + register it. SIM meshes colliders + materializes
   * entities (from snapshots if seen before, else from descriptors); LOAD holds whatever it has
   * (snapshots if hydrated, else dormant descriptors — no store work, so distant rings are cheap).
   * @param {Object} rec
   */
  _activate(rec) {
    if (rec.ring === "sim") this._materialize(rec);
    this._chunks[this._key(rec.cx, rec.cy)] = rec;
    this.stats.loaded++;
  }

  /**
   * Bring a record's entities into the store + mesh its colliders (SIM ring). Restores snapshots if
   * the chunk has lived before, else spawns its descriptors for the first time.
   * @param {Object} rec
   */
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

  /**
   * load → sim
   * @param {Object} rec
   */
  _promote(rec) {
    this._materialize(rec);
    rec.ring = "sim";
    this.stats.promoted++;
  }

  /**
   * sim → load: snapshot live entities out of the store + drop colliders
   * @param {Object} rec
   */
  _demote(rec) {
    this._captureAll(rec);
    this._dropColliders(rec);
    rec.ring = "load";
    this.stats.demoted++;
  }

  /**
   * beyond load radius: snapshot live entities, drop colliders, park the WHOLE record in cache
   * (so a revisit skips generate() and keeps modified entity state)
   * @param {string} key
   * @param {Object} rec
   */
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

  /**
   * one kinematic-solid collider per wall + solid rect (source already groups cells into rects).
   * matches TileEdit.meshSolid: Position at rect top-left, BBox (0,0) spanning it.
   * @param {Object} rec
   */
  _meshColliders(rec) {
    this._meshRects(rec, rec.walls);
    this._meshRects(rec, rec.solid);
  }

  /**
   * @param {Object} rec
   * @param {number[][]} [rects]
   */
  _meshRects(rec, rects) {
    if (rects === undefined) return;
    const cw = this.cellW;
    const ch = this.cellH;
    const entities = this.entities;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const id = entities.create();
      entities.add(id, Position, { x: r[0] * cw, y: r[1] * ch, z: 0 });
      entities.add(id, BBox, {
        x: 0,
        y: 0,
        width: r[2] * cw,
        height: r[3] * ch,
      });
      entities.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      rec.colliders.push(id);
    }
  }

  /** @param {Object} rec */
  _dropColliders(rec) {
    for (let i = 0; i < rec.colliders.length; i++)
      this.entities.remove(rec.colliders[i]);
    rec.colliders = [];
  }

  /**
   * @param {Object} rec
   * @param {Object[]} spawns
   */
  _spawnAll(rec, spawns) {
    if (spawns.length === 0) return;
    if (this._spawn === null)
      throw new Error(
        "ChunkManager: chunk has spawns but no opts.spawn adapter",
      );
    for (let i = 0; i < spawns.length; i++) {
      const id = this._spawn(this.entities, this.grid, spawns[i]);
      if (id !== undefined && id !== -1) rec.entities.push(id);
    }
  }

  /**
   * @param {Object} rec
   * @param {EntitySnapshotRecord[]} snapshots
   */
  _restoreAll(rec, snapshots) {
    for (let i = 0; i < snapshots.length; i++)
      rec.entities.push(EntitySnapshot.restore(this.entities, snapshots[i]));
  }

  /**
   * entities → snapshots, removing each from the store. skips invalid ids (e.g. killed enemies) so the dead stay dead.
   * @param {Object} rec
   */
  _captureAll(rec) {
    const snaps = [];
    for (let i = 0; i < rec.entities.length; i++) {
      const id = rec.entities[i];
      if (!this.entities.isValid(id)) continue;
      snaps.push(EntitySnapshot.capture(this.entities, id));
      this.entities.remove(id);
    }
    rec.entities = [];
    rec.snapshots = snaps;
  }
};

// Procedural overworld generator — the swappable "how is wilderness generated" half of chunk
// streaming. ChunkSource routes authored hub chunks to the level file and everything else here;
// swap in another generator (cave/desert/...) with the same generate(cx,cy) contract.
//
// Contract (consumed by ChunkSource → ChunkManager): generate/terrain/solid all return ABSOLUTE
// grid coords, fully deterministic from (cx, cy, seed) — a chunk MUST regenerate identically every
// visit (the streaming cache persists only ENTITY state, never terrain).
//   generate -> { terrain: Int[cols*rows], walls/solid: [[gx,gy,w,h]...], spawns: [...] }
//   terrain  -> per-cell material-id grid (value-noise biome, see TERRAIN), pure in absolute coords
//               so chunks agree at seams.
//   solid    -> greedy-meshed rects of impassable cells (water) → collide-only colliders, so water
//               blocks the player AND feeds NavGrid.
//
// Determinism comes from a per-chunk seed fed to a MINSTD LCG (see PRNG note below — GMRT
// miscompiles xorshift). GMRT-safe: index loops, Object.keys (no Map/Set for-of), class on globalThis.
globalThis.OverworldGen = class OverworldGen {
  constructor(opts = {}) {
    this.seed = (opts.seed ?? 1337) | 0;
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    // probability a chunk stamps a prefab (rest is loose scatter only)
    this.prefabChance = opts.prefabChance ?? 0.45;
    // prefab scope: only prefabs with this tag are eligible (a cave generator draws a different set);
    // empty set ⇒ stamping is a no-op
    this.prefabs = Prefab.byTag(opts.prefabTag ?? "overworld");
  }

  // deterministic terrain + spawns for a chunk
  generate(cx, cy) {
    const rng = this._rng(this._seedFor(cx, cy));
    const gx0 = cx * this.chunkCols;
    const gy0 = cy * this.chunkRows;
    const walls = [];
    const spawns = [];

    // one optional stamped prefab, kept in the interior so it can't straddle a chunk seam
    if (this.prefabs.length > 0 && rng() < this.prefabChance)
      this._stamp(rng, gx0, gy0, walls, spawns);

    this._scatter(rng, gx0, gy0, walls, spawns);
    return {
      terrain: this.terrain(cx, cy),
      solid: this.solidTerrain(cx, cy),
      walls,
      spawns,
    };
  }

  // terrain (value-noise biome)
  // Per-cell material grid, row-major. Each cell's material is a pure function of its ABSOLUTE
  // coords (not per-chunk RNG — that would tear at seams), so adjacent chunks line up.
  terrain(cx, cy) {
    const cc = this.chunkCols;
    const cr = this.chunkRows;
    const gx0 = cx * cc;
    const gy0 = cy * cr;
    const out = new Array(cc * cr);
    for (let ly = 0; ly < cr; ly++)
      for (let lx = 0; lx < cc; lx++)
        out[ly * cc + lx] = this._material(gx0 + lx, gy0 + ly);
    return out;
  }

  // single-cell biome lookup (TerrainStream's seam apron) — same threshold terrain() uses, so an
  // apron cell matches the neighbor chunk's interior exactly
  materialAt(ax, ay) {
    return this._material(ax, ay);
  }

  // true if walkable (pathCost !== null); the single "can stand here" source for spawns + the solid mesh
  _passable(ax, ay) {
    return OverworldGen.TERRAIN[this._material(ax, ay)].pathCost !== null;
  }

  // Greedy-mesh impassable cells (water) into the fewest [gx,gy,w,h] rects, so ChunkManager makes one
  // collider per rect not a per-cell box (per-cell seams snag sliding bodies — see memory
  // project_tile_collider_seams). Pure in (cx, cy, seed); returns [] when nothing is impassable.
  solidTerrain(cx, cy) {
    const cc = this.chunkCols;
    const cr = this.chunkRows;
    const gx0 = cx * cc;
    const gy0 = cy * cr;
    // per-cell blocked flags; bail early if nothing is impassable
    const blocked = new Array(cc * cr);
    let any = false;
    for (let ly = 0; ly < cr; ly++)
      for (let lx = 0; lx < cc; lx++) {
        const b = !this._passable(gx0 + lx, gy0 + ly);
        blocked[ly * cc + lx] = b;
        if (b) any = true;
      }
    if (!any) return [];

    // Greedy mesh: extend right for width, then down while the whole row stays blocked.
    const consumed = new Array(cc * cr).fill(false);
    const solid = (x, y) =>
      x < cc && y < cr && blocked[y * cc + x] && !consumed[y * cc + x];
    const rects = [];
    for (let y = 0; y < cr; y++) {
      for (let x = 0; x < cc; x++) {
        if (!solid(x, y)) continue;
        let w = 1;
        while (solid(x + w, y)) w++;
        let h = 1;
        for (let grow = true; grow; h++) {
          for (let k = 0; k < w; k++)
            if (!solid(x + k, y + h)) {
              grow = false;
              break;
            }
        }
        h--; // last iteration that incremented also set grow=false
        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) consumed[yy * cc + xx] = true;
        rects.push([gx0 + x, gy0 + y, w, h]);
      }
    }
    return rects;
  }

  // threshold the noise into a material id (index into TERRAIN, ascending thresholds)
  _material(ax, ay) {
    const n = this._noise(ax, ay);
    const pal = OverworldGen.TERRAIN;
    for (let i = 0; i < pal.length; i++) if (n < pal[i].threshold) return i;
    return pal.length - 1;
  }

  // value noise in [0,1): smoothstep-interpolated over a coarse hashed lattice; pure in (ax, ay, seed)
  _noise(ax, ay) {
    const L = OverworldGen.LATTICE;
    const fx = ax / L;
    const fy = ay / L;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    let tx = fx - ix;
    let ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); // smoothstep for blobby, non-grid-aligned regions
    ty = ty * ty * (3 - 2 * ty);
    const v00 = this._hash(ix, iy);
    const v10 = this._hash(ix + 1, iy);
    const v01 = this._hash(ix, iy + 1);
    const v11 = this._hash(ix + 1, iy + 1);
    const a = v00 + (v10 - v00) * tx;
    const b = v01 + (v11 - v01) * tx;
    return a + (b - a) * ty;
  }

  // hash a lattice point to [0,1) — MINSTD integer-float math (no bitwise chain, which GMRT
  // miscompiles); every product stays < 2^53, so it's exact
  _hash(ix, iy) {
    const M = 2147483647;
    let h = this.seed % M;
    h = (((h * 31 + (ix | 0) * 1900613) % M) + M) % M;
    h = (((h * 31 + (iy | 0) * 7368787) % M) + M) % M;
    h = (h * 48271) % M;
    return h / M;
  }

  // prefab stamping

  // Pick a prefab (weighted) and translate its local coords to absolute at a random interior
  // offset (1-cell margin so its walls don't merge across a chunk seam).
  _stamp(rng, gx0, gy0, walls, spawns) {
    const p = this._pick(rng);
    if (p === undefined) return;
    const maxOx = this.chunkCols - 2 - p.cols;
    const maxOy = this.chunkRows - 2 - p.rows;
    if (maxOx < 0 || maxOy < 0) return; // larger than the chunk interior — skip
    const ox = gx0 + 1 + Math.floor(rng() * (maxOx + 1));
    const oy = gy0 + 1 + Math.floor(rng() * (maxOy + 1));

    for (let i = 0; i < p.walls.length; i++) {
      const r = p.walls[i];
      walls.push([ox + r[0], oy + r[1], r[2], r[3]]);
    }
    for (let i = 0; i < p.spawns.length; i++) {
      const s = this._placeSpawn(p.spawns[i], ox, oy, rng);
      // don't drop a dynamic enemy into water — it'd snag in the collider
      if (s.preset === "raider" && !this._passable(s.gx, s.gy)) continue;
      spawns.push(s);
    }
  }

  // weighted pick from the eligible prefab set
  _pick(rng) {
    const all = this.prefabs;
    let total = 0;
    for (let i = 0; i < all.length; i++) total += all[i].weight;
    let r = rng() * total;
    for (let i = 0; i < all.length; i++) {
      r -= all[i].weight;
      if (r < 0) return all[i];
    }
    return all[all.length - 1];
  }

  // Local → absolute spawn descriptor. Deep-copies item arrays (loot/items) so stamped instances
  // never share — and mutate on pickup — the registry def's arrays.
  _placeSpawn(s, ox, oy, rng) {
    const out = {};
    const keys = Object.keys(s);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k === "lx" || k === "ly") continue;
      out[k] = s[k];
    }
    out.gx = ox + s.lx;
    out.gy = oy + s.ly;
    if (out.loot !== undefined) out.loot = this._cloneItems(out.loot);
    if (out.items !== undefined) out.items = this._cloneItems(out.items);
    if (out.preset === "raider" && out.loot === undefined)
      out.loot = this._loot(rng);
    return out;
  }

  _cloneItems(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i++)
      out.push({ itemId: arr[i].itemId, qty: arr[i].qty });
    return out;
  }

  // loose scatter

  _scatter(rng, gx0, gy0, walls, spawns) {
    const cc = this.chunkCols;
    const cr = this.chunkRows;

    // rock clusters; kept off the 1-cell border so a cluster never merges across a seam or blocks an entrance
    const rocks = 2 + Math.floor(rng() * 3); // 2..4
    for (let i = 0; i < rocks; i++) {
      const w = 1 + Math.floor(rng() * 2);
      const h = 1 + Math.floor(rng() * 2);
      const lx = 1 + Math.floor(rng() * (cc - 2 - w));
      const ly = 1 + Math.floor(rng() * (cr - 2 - h));
      walls.push([gx0 + lx, gy0 + ly, w, h]);
    }

    // wandering rats are the ambient wildlife; raiders stay the camp/quest enemy (bandit_camp prefab)
    const rats = 1 + Math.floor(rng() * 3); // 1..3
    for (let i = 0; i < rats; i++) {
      const lx = 1 + Math.floor(rng() * (cc - 2));
      const ly = 1 + Math.floor(rng() * (cr - 2));
      // skip impassable terrain — a dynamic body inside a water collider snags
      if (!this._passable(gx0 + lx, gy0 + ly)) continue;
      spawns.push({
        preset: "rat",
        gx: gx0 + lx,
        gy: gy0 + ly,
        hp: 2,
        loot: rng() > 0.5 ? [{ itemId: "rags", qty: 1 }] : [],
      });
    }
  }

  _loot(rng) {
    const loot = [{ itemId: "rags", qty: 1 + Math.floor(rng() * 2) }];
    const roll = rng();
    if (roll > 0.85) loot.push({ itemId: "circuitry", qty: 1 });
    else if (roll > 0.6)
      loot.push({ itemId: "coin", qty: 1 + Math.floor(rng() * 3) });
    return loot;
  }

  // deterministic PRNG: Park–Miller MINSTD LCG over pure integer-float math, NOT xorshift32 —
  // GMRT miscompiles xorshift (its shift chain collapses to a constant 0.5 for many seeds). Integer
  // multiply-mod keeps every intermediate exact below 2^53.

  // fold (cx, cy, seed) into a positive LCG seed in [1, M] (M = 2^31-1); distinct chunks → distinct seeds
  _seedFor(cx, cy) {
    const M = 2147483647;
    let h = this.seed % M;
    h = (((h * 31 + (cx | 0) * 1900613) % M) + M) % M;
    h = (((h * 31 + (cy | 0) * 7368787) % M) + M) % M;
    return h + 1; // [1, M]
  }

  // MINSTD generator yielding floats in [0, 1): s' = s * 48271 mod (2^31-1); product stays < 2^53 (exact)
  _rng(seed) {
    const M = 2147483647;
    let s = seed % M;
    if (s <= 0) s += M - 1;
    return function () {
      s = (s * 48271) % M;
      return (s - 1) / (M - 1);
    };
  }
};

// Biome palette: material id = index; ascending `threshold` over the value noise (water → grass).
// `sprite` is the untinted dual-grid tileset TerrainStream renders the layer with; `color` is the
// design-reference tint (no longer drawn — real colored art now). Cumulative-stacked, so each upper
// terrain's dual border reveals the one below. `pathCost` follows TileType (null → impassable →
// collide-only collider per chunk via solidTerrain; walkable = 1, so nav stays binary).
// Assigned after the class (not a static initializer) — GMRT static-field-init quirk.
OverworldGen.TERRAIN = [
  {
    id: "water",
    name: "Water",
    color: "#2e6b8f",
    sprite: "spr_terrainWater",
    threshold: 0.32,
    pathCost: null,
  },
  {
    id: "sand",
    name: "Sand",
    color: "#c2a878",
    sprite: "spr_terrainSand",
    threshold: 0.5,
    pathCost: 1,
  },
  {
    id: "grass",
    name: "Grass",
    color: "#5d8a46",
    sprite: "spr_terrainGrass",
    threshold: Infinity,
    pathCost: 1,
  },
];

// Design-reference material palette (full set by id + name + intended tint). TERRAIN above is the
// currently-WIRED subset; entries here (e.g. thinice/ice — climate variants) await promotion into
// the active gradient. Assigned after the class — GMRT static-field-init quirk.
OverworldGen.PALETTE = [
  { id: "water", name: "Water", color: "#639bff" },
  { id: "deepwater", name: "Deep Water", color: "#5b6ee1" },
  { id: "thinice", name: "Thin Ice", color: "#cbdbfc" },
  { id: "ice", name: "Ice", color: "#5fcde4" },
  { id: "sand", name: "Sand", color: "#eec39a" },
  { id: "soil", name: "Soil", color: "#8f563b" },
  { id: "barren", name: "Barren", color: "#d9a066" },
  { id: "richsoil", name: "Rich Soil", color: "#663931" },
  { id: "grass", name: "Grass", color: "#6abe30" },
  { id: "jungle", name: "Jungle", color: "#37946e" },
];
OverworldGen.LATTICE = 10; // value-noise lattice spacing in cells (bigger = larger biome blobs)

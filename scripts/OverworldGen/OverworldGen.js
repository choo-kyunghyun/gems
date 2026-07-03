// Procedural overworld generator — the RPG's "how is wilderness generated" half of chunk streaming.
// ChunkSource routes authored hub chunks to the level file and everything else here; swap in another
// generator (cave/desert/...) with the same generate(cx,cy) contract.
//
// After the machinery + data splits this file is generator LOGIC only: the stamp/scatter engine,
// the loot table, and the spawn-policy hooks. The generic machinery lives in Core — `TerrainField`
// (palette-driven material/cost/solid sampling, held as this.field) and `Rand` (the deterministic
// MINSTD hashing/PRNG) — and the DATA (biome palette + noise tuning) in `RpgBiomes` (Demo/Content).
// A sibling generator composes the same pieces with its own palette + tables.
//
// Contract (consumed by ChunkSource → ChunkManager): generate/terrain/solid all return ABSOLUTE
// grid coords, fully deterministic from (cx, cy, seed) — a chunk MUST regenerate identically every
// visit (the streaming cache persists only ENTITY state, never terrain).
//   generate -> { terrain: Int[cols*rows], walls/solid: [[gx,gy,w,h]...], spawns: [...] }
//   terrain  -> per-cell material-id grid (value-noise biome, see RpgBiomes.TERRAIN), pure in
//               absolute coords so chunks agree at seams.
//   solid    -> greedy-meshed rects of impassable cells (deep water; shallow water is wadeable)
//               → collide-only colliders that block bodies AND feed NavGrid.
//
// GMRT-safe: index loops, Object.keys (no Map/Set for-of), class on globalThis.
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
    // chunk output has no tiles/zones channel — warn once at construction so an authored
    // channel doesn't silently vanish (apply()-based generators consume them; this one can't)
    for (let i = 0; i < this.prefabs.length; i++) {
      const p = this.prefabs[i];
      if (p.tiles.length > 0 || p.zones.length > 0)
        Log.warn(
          `OverworldGen: prefab '${p.id}' has tiles/zones — chunk output drops them`,
        );
    }
    // the generic terrain sampler (Core) over this generator's palette (data in RpgBiomes);
    // `palette` is the field ChunkSource.palette() exposes to TerrainStream (render order =
    // palette order)
    this.field = new TerrainField(RpgBiomes.TERRAIN, {
      seed: this.seed,
      chunkCols: this.chunkCols,
      chunkRows: this.chunkRows,
      lattice: RpgBiomes.LATTICE,
      groundLattice: RpgBiomes.GROUND_LATTICE,
      groundSalt: RpgBiomes.GROUND_SALT,
    });
    this.palette = RpgBiomes.TERRAIN;
    // Spawn-policy hooks — the content the stamp engine (_stamp/_placeSpawn) calls instead of
    // hardcoding preset ids; override via opts for a variant generator.
    //   spawnFilter(s, field) -> keep this stamped spawn? Default: mobile combatants (raider) stay
    //     off water — nothing spawns swimming, and deep water's collider would snag a dynamic body.
    //   defaultLoot(s, rng) -> loot array for a spawn that authored none, or undefined to leave it.
    this.spawnFilter =
      opts.spawnFilter ??
      ((s, field) => s.preset !== "raider" || field.spawnable(s.gx, s.gy));
    this.defaultLoot =
      opts.defaultLoot ??
      ((s, rng) =>
        s.preset === "raider" && s.loot === undefined
          ? this._loot(rng)
          : undefined);
  }

  // deterministic terrain + spawns for a chunk
  generate(cx, cy) {
    const rng = Rand.lcg(Rand.seed2(cx, cy, this.seed));
    const gx0 = cx * this.chunkCols;
    const gy0 = cy * this.chunkRows;
    const walls = [];
    const spawns = [];

    // one optional stamped prefab, kept in the interior so it can't straddle a chunk seam
    if (this.prefabs.length > 0 && rng() < this.prefabChance)
      this._stamp(rng, gx0, gy0, walls, spawns);

    this._scatter(rng, gx0, gy0, walls, spawns);
    return {
      terrain: this.field.terrain(cx, cy),
      solid: this.field.solidTerrain(cx, cy),
      walls,
      spawns,
    };
  }

  // thin delegates to the terrain sampler — the duck-typed surface ChunkSource routes
  // (TerrainStream's seam apron, NavGrid weights + PathFollow speed pricing)
  materialAt(ax, ay) {
    return this.field.materialAt(ax, ay);
  }
  costAt(ax, ay) {
    return this.field.costAt(ax, ay);
  }
  terrain(cx, cy) {
    return this.field.terrain(cx, cy);
  }
  solidTerrain(cx, cy) {
    return this.field.solidTerrain(cx, cy);
  }

  // prefab stamping (generic engine — content enters via the constructor hooks)

  // Pick a prefab (weighted) and stamp it (Prefab.stamp translates local→absolute) at a random
  // interior offset (1-cell margin so its walls don't merge across a chunk seam). Chunk output
  // consumes the walls + spawns channels only (see the constructor warn).
  _stamp(rng, gx0, gy0, walls, spawns) {
    const p = this._pick(rng);
    if (p === undefined) return;
    const maxOx = this.chunkCols - 2 - p.cols;
    const maxOy = this.chunkRows - 2 - p.rows;
    if (maxOx < 0 || maxOy < 0) return; // larger than the chunk interior — skip
    const ox = gx0 + 1 + Math.floor(rng() * (maxOx + 1));
    const oy = gy0 + 1 + Math.floor(rng() * (maxOy + 1));

    const st = p.stamp(ox, oy);
    for (let i = 0; i < st.walls.length; i++) walls.push(st.walls[i]);
    for (let i = 0; i < st.spawns.length; i++) {
      const s = st.spawns[i];
      // stamp's spawn copy is shallow — deep-copy item arrays so stamped instances never
      // share (and mutate on pickup) the registry def's arrays
      if (s.loot !== undefined) s.loot = this._cloneItems(s.loot);
      if (s.items !== undefined) s.items = this._cloneItems(s.items);
      // defaultLoot draws its roll BEFORE the spawnFilter verdict so a filtered-out spawn
      // consumes the same rng draws — the chunk's remaining placements must not shift
      const extra = this.defaultLoot(s, rng);
      if (extra !== undefined) s.loot = extra;
      if (!this.spawnFilter(s, this.field)) continue;
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

  _cloneItems(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i++)
      out.push({ itemId: arr[i].itemId, qty: arr[i].qty });
    return out;
  }

  // loose scatter (RPG content)

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

    // wandering rats are the ambient wildlife; raiders stay the camp/quest enemy (raider_camp prefab)
    const rats = 1 + Math.floor(rng() * 3); // 1..3
    for (let i = 0; i < rats; i++) {
      const lx = 1 + Math.floor(rng() * (cc - 2));
      const ly = 1 + Math.floor(rng() * (cr - 2));
      // keep wildlife off water (no swimming spawns; deep water would snag it)
      if (!this.field.spawnable(gx0 + lx, gy0 + ly)) continue;
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
};

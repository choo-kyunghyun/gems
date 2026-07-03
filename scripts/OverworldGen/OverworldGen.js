// Procedural overworld generator — the RPG's "how is wilderness generated" half of chunk streaming.
// ChunkSource routes authored hub chunks to the level file and everything else here; swap in another
// generator (cave/desert/...) with the same generate(cx,cy) contract.
//
// After the machinery split this file is the CONTENT: the biome palette (TERRAIN), the scatter +
// loot tables, and the spawn-policy hooks. The generic machinery lives in Core — `TerrainField`
// (palette-driven material/cost/solid sampling, held as this.field) and `Rand` (the deterministic
// MINSTD hashing/PRNG). A sibling generator composes the same pieces with its own palette + tables.
//
// Contract (consumed by ChunkSource → ChunkManager): generate/terrain/solid all return ABSOLUTE
// grid coords, fully deterministic from (cx, cy, seed) — a chunk MUST regenerate identically every
// visit (the streaming cache persists only ENTITY state, never terrain).
//   generate -> { terrain: Int[cols*rows], walls/solid: [[gx,gy,w,h]...], spawns: [...] }
//   terrain  -> per-cell material-id grid (value-noise biome, see TERRAIN), pure in absolute coords
//               so chunks agree at seams.
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
    // the generic terrain sampler (Core) over this generator's palette; `palette` is the field
    // ChunkSource.palette() exposes to TerrainStream (render order = palette order)
    this.field = new TerrainField(OverworldGen.TERRAIN, {
      seed: this.seed,
      chunkCols: this.chunkCols,
      chunkRows: this.chunkRows,
      lattice: OverworldGen.LATTICE,
      groundLattice: OverworldGen.GROUND_LATTICE,
      groundSalt: OverworldGen.GROUND_SALT,
    });
    this.palette = OverworldGen.TERRAIN;
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

  // Local → absolute spawn descriptor. Deep-copies item arrays (loot/items) so stamped instances
  // never share — and mutate on pickup — the registry def's arrays. defaultLoot draws its roll
  // HERE (before the spawnFilter verdict) so a filtered-out spawn consumes the same rng draws —
  // the chunk's remaining placements must not shift.
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
    const extra = this.defaultLoot(out, rng);
    if (extra !== undefined) out.loot = extra;
    return out;
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

    // wandering rats are the ambient wildlife; raiders stay the camp/quest enemy (bandit_camp prefab)
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

// Biome palette (the TerrainField contract): material id = index = painter order (TerrainStream
// stacks cumulatively, so each upper terrain's dual border reveals the one below). `threshold`
// entries are the ELEVATION gradient (ascending — deep water → water → sand; past the last one the
// cell is land), `ground` entries (ascending over the independent ground-detail noise) split the
// land — grass dominant, with wet depressions (richsoil → soil → mud going in) and rock outcrops
// (gravel ringing rocky) as patchy features. `sprite` is the untinted dual-grid tileset
// TerrainStream renders the layer with; `color` is the design-reference tint (no longer drawn —
// real colored art now). `pathCost` is the WEIGHTED movement cost (TileType convention: null →
// impassable): it prices both pathfinding (NavGrid samples it, MotionPlanner multiplies step
// distance by it) and movement-point consumption (PathFollow.speedScale — a mover's speed ×
// 1/cost). Easy ground 1, loose 1.5, rough 2; shallow water is WADEABLE at 3 (slow, and A* only
// wades when it beats walking around) but `spawnable: false` (travel yes, homes no); only deep
// water is null → a collide-only collider per chunk via TerrainField.solidTerrain. Assigned after
// the class (not a static initializer) — GMRT static-field-init quirk.
OverworldGen.TERRAIN = [
  {
    id: "deepwater",
    name: "Deep Water",
    color: "#3e5870",
    sprite: "spr_terrainDeepwater",
    threshold: 0.22,
    pathCost: null,
  },
  {
    id: "water",
    name: "Water",
    color: "#2e6b8f",
    sprite: "spr_terrainWater",
    threshold: 0.32,
    pathCost: 3,
    spawnable: false,
  },
  {
    id: "sand",
    name: "Sand",
    color: "#c2a878",
    sprite: "spr_terrainSand",
    threshold: 0.5,
    pathCost: 1.5,
  },
  {
    id: "mud",
    name: "Mud",
    color: "#605444",
    sprite: "spr_terrainMud",
    ground: 0.16,
    pathCost: 2,
  },
  {
    id: "soil",
    name: "Soil",
    color: "#8c7558",
    sprite: "spr_terrainSoil",
    ground: 0.3,
    pathCost: 1,
  },
  {
    id: "richsoil",
    name: "Rich Soil",
    color: "#6e5840",
    sprite: "spr_terrainRichsoil",
    ground: 0.36,
    pathCost: 1,
  },
  {
    id: "grass",
    name: "Grass",
    color: "#5d8a46",
    sprite: "spr_terrainGrass",
    ground: 0.76,
    pathCost: 1,
  },
  {
    id: "gravel",
    name: "Gravel",
    color: "#858178",
    sprite: "spr_terrainGravel",
    ground: 0.86,
    pathCost: 1.5,
  },
  {
    id: "rocky",
    name: "Rocky",
    color: "#76746e",
    sprite: "spr_terrainRocky",
    ground: Infinity,
    pathCost: 2,
  },
];

// Design-reference material palette (full set by id + name + intended tint). TERRAIN above is the
// currently-WIRED subset; the remaining entries (thinice/ice — climate variants; barren/jungle)
// await promotion into the active gradient. Assigned after the class — GMRT static-field-init quirk.
OverworldGen.PALETTE = [
  { id: "water", name: "Water", color: "#639bff" },
  { id: "deepwater", name: "Deep Water", color: "#5b6ee1" },
  { id: "thinice", name: "Thin Ice", color: "#cbdbfc" },
  { id: "ice", name: "Ice", color: "#5fcde4" },
  { id: "sand", name: "Sand", color: "#eec39a" },
  { id: "mud", name: "Mud", color: "#695444" },
  { id: "soil", name: "Soil", color: "#8f563b" },
  { id: "barren", name: "Barren", color: "#d9a066" },
  { id: "richsoil", name: "Rich Soil", color: "#663931" },
  { id: "grass", name: "Grass", color: "#6abe30" },
  { id: "jungle", name: "Jungle", color: "#37946e" },
  { id: "gravel", name: "Gravel", color: "#9badb7" },
  { id: "rocky", name: "Rocky", color: "#847e87" },
];
OverworldGen.LATTICE = 10; // value-noise lattice spacing in cells (bigger = larger biome blobs)
// ground-detail channel: independent land-material noise (see TerrainField.materialAt). Smaller
// lattice = smaller patches than the biome blobs; the salt decorrelates it from elevation.
OverworldGen.GROUND_LATTICE = 6;
OverworldGen.GROUND_SALT = 1013904223;

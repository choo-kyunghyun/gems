// The RPG overworld generator COMPOSITION — after the frame/pass split this file holds only
// what is RPG policy/content: `create(opts)` wires a Core **ChunkGenerator** (the pass frame)
// with the RPG's TerrainField (data in RpgBiomes) and four passes — the **AuthoredStamp**
// overlay (the hand-built hub, procedural-free inside its box), a **PrefabStamp** carrying the
// RPG spawn policy, and the two scatter passes (rocks + rats). A different world (cave/desert/…)
// is a different composition of the same Core pieces, not a rewrite; a variant overworld
// overrides the policy hooks via opts.
//
// Contract: `create` returns a ChunkGenerator — the source ChunkManager holds directly:
// generate(cx,cy) → { terrain, solid, walls, spawns } (absolute grid coords, deterministic from
// (cx, cy, seed, pass salt) — the same seed MUST rebuild the same world, since a cold rebuild
// after map eviction re-runs pregeneration; each pass draws from its OWN salted stream, so
// adding/removing a pass never reshuffles the others' output), plus the `palette` field + the
// samplers (materialAt/costAt/terrain/solidTerrain).
//
// GMRT-safe: index loops, namespace object on globalThis.
globalThis.OverworldGen = {
  /**
   * Build the overworld generator. opts: { seed, chunkCols, chunkRows, authored, prefabChance,
   * prefabTag, spawnFilter, defaultLoot } — `authored` is the level-file data whose walls/spawns
   * overlay the hub chunks (see AuthoredStamp); the last two override the RPG spawn policy (see
   * PrefabStamp). Register prefabs before calling (PrefabStamp resolves Prefab.byTag in its
   * constructor).
   * @returns {ChunkGenerator}
   */
  create(opts = {}) {
    const seed = (opts.seed ?? 1337) | 0;
    const chunkCols = opts.chunkCols ?? 16;
    const chunkRows = opts.chunkRows ?? 16;
    // the generic terrain sampler (Core) over the RPG's biome data; its palette is what
    // TerrainStream renders by (render order = palette order)
    const field = new TerrainField(RpgBiomes.TERRAIN, {
      seed: seed,
      chunkCols: chunkCols,
      chunkRows: chunkRows,
      lattice: RpgBiomes.LATTICE,
      groundLattice: RpgBiomes.GROUND_LATTICE,
      groundSalt: RpgBiomes.GROUND_SALT,
    });
    return new ChunkGenerator({
      seed: seed,
      chunkCols: chunkCols,
      chunkRows: chunkRows,
      field: field,
      passes: [
        // hand-built hub overlaid onto its chunks FIRST — claims them (ctx.authored), so the
        // procedural passes below leave the hub area alone
        new AuthoredStamp({
          data: opts.authored,
          chunkCols: chunkCols,
          chunkRows: chunkRows,
          salt: 4,
        }),
        new PrefabStamp({
          tag: opts.prefabTag ?? "overworld",
          salt: 1,
          chance: opts.prefabChance ?? 0.45,
          // RPG spawn policy: mobile combatants (raider) stay off water — nothing spawns
          // swimming, and deep water's collider would snag a dynamic body
          spawnFilter:
            opts.spawnFilter ??
            ((s, field) =>
              s.preset !== "raider" || field.spawnable(s.gx, s.gy)),
          // a raider that authored no loot rolls the wilderness table
          defaultLoot:
            opts.defaultLoot ??
            ((s, rng) =>
              s.preset === "raider" && s.loot === undefined
                ? OverworldGen.rollLoot(rng)
                : undefined),
        }),
        OverworldGen.rocks(),
        OverworldGen.rats(),
      ],
    });
  },

  // rock clusters; kept off the 1-cell border so a cluster never merges across a seam or
  // blocks an entrance
  rocks() {
    return {
      salt: 2,
      apply(ctx) {
        if (ctx.authored === true) return; // hub chunks are hand-built
        const rng = ctx.rng;
        const rocks = 2 + Math.floor(rng() * 3); // 2..4
        for (let i = 0; i < rocks; i++) {
          const w = 1 + Math.floor(rng() * 2);
          const h = 1 + Math.floor(rng() * 2);
          const lx = 1 + Math.floor(rng() * (ctx.cols - 2 - w));
          const ly = 1 + Math.floor(rng() * (ctx.rows - 2 - h));
          ctx.out.walls.push([ctx.gx0 + lx, ctx.gy0 + ly, w, h]);
        }
      },
    };
  },

  // wandering rats are the ambient wildlife; raiders stay the camp/quest enemy (raider_camp prefab)
  rats() {
    return {
      salt: 3,
      apply(ctx) {
        if (ctx.authored === true) return; // hub chunks are hand-built
        const rng = ctx.rng;
        const rats = 1 + Math.floor(rng() * 3); // 1..3
        for (let i = 0; i < rats; i++) {
          const gx = ctx.gx0 + 1 + Math.floor(rng() * (ctx.cols - 2));
          const gy = ctx.gy0 + 1 + Math.floor(rng() * (ctx.rows - 2));
          // keep wildlife off water (no swimming spawns; deep water would snag it)
          if (!ctx.field.spawnable(gx, gy)) continue;
          ctx.out.spawns.push({
            preset: "rat",
            gx: gx,
            gy: gy,
            hp: 2,
            loot: rng() > 0.5 ? [{ itemId: "rags", qty: 1 }] : [],
          });
        }
      },
    };
  },

  // wilderness raider loot table (the PrefabStamp defaultLoot policy)
  rollLoot(rng) {
    const loot = [{ itemId: "rags", qty: 1 + Math.floor(rng() * 2) }];
    const roll = rng();
    if (roll > 0.85) loot.push({ itemId: "circuitry", qty: 1 });
    else if (roll > 0.6)
      loot.push({ itemId: "coin", qty: 1 + Math.floor(rng() * 3) });
    return loot;
  },
};

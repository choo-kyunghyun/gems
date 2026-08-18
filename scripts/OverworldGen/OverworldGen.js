/**
 * The four passes: the AuthoredStamp overlay (the hand-built hub, procedural-free inside its claim), a
 * PrefabStamp carrying the colony spawn policy, and two scatter passes (rocks + rats). A different world
 * (cave/desert/…) is a different composition of the same Core pieces, not a rewrite; a variant
 * overworld overrides the policy hooks via opts.
 *
 * Contract: `create` returns a LevelGen the level builder holds directly — generate(cols, rows) →
 * { walls, spawns, solid } (grid coords, deterministic from (seed, pass salt): the same seed MUST
 * rebuild the same level, since a save stores only entity state and the ground comes back from the
 * seed; each pass draws from its OWN salted stream, so adding/removing a pass never reshuffles the
 * others' output) — plus the `palette` field and paint().
 *
 * Scatter DENSITY is per 1000 cells, so a pass covers whatever level it is handed. Every scatter
 * respects ctx.claimed, so nothing lands inside the hub, a stamped prefab, or an earlier boulder.
 * GMRT-safe: index loops, namespace object on globalThis.
 */

globalThis.OverworldGen = {
  /**
   * Build the overworld generator. opts: { seed, authored, prefabDensity, prefabTag, spawnFilter,
   * defaultLoot } — `authored` is the level-file data whose walls/spawns overlay the hub (see
   * AuthoredStamp); the last two override the colony spawn policy (see PrefabStamp). Register prefabs
   * before calling (PrefabStamp resolves Prefab.byTag in its constructor).
   */
  create(opts = {}) {
    const seed = (opts.seed ?? 1337) | 0;
    // the generic terrain sampler (Core) over the colony's biome data; its palette is what the
    // terrain layer's TileTypes and the stacked dual-grid passes are built from (order = painter order)
    const field = new TerrainField(contentBiomes.TERRAIN, {
      seed: seed,
      lattice: contentBiomes.LATTICE,
      groundLattice: contentBiomes.GROUND_LATTICE,
      groundSalt: contentBiomes.GROUND_SALT,
    });
    return new LevelGen({
      seed: seed,
      field: field,
      passes: [
        // hand-built hub laid down FIRST — it claims its extent, so the procedural passes below
        // leave the hub area alone
        new AuthoredStamp({
          data: opts.authored,
          salt: 4,
        }),
        new PrefabStamp({
          tag: opts.prefabTag ?? "overworld",
          salt: 1,
          density: opts.prefabDensity ?? 1.76,
          // Colony spawn policy: mobile combatants (raider) stay off water — nothing spawns
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
        OverworldGen.trees(),
        OverworldGen.rats(),
      ],
    });
  },

  /**
   * scattered pines — one solid `tree` preset entity each (trunk collider, overhanging canopy
   * mesh); off water like the wildlife, with a position-hashed quarter-turn + size so the one
   * model doesn't visibly repeat (hashes draw nothing from the pass stream)
   */
  trees() {
    return {
      salt: 5,
      density: 6.8,
      apply(ctx) {
        const rng = ctx.rng;
        const trees = OverworldGen.count(ctx, this.density);
        for (let i = 0; i < trees; i++) {
          const gx = 1 + Math.floor(rng() * (ctx.cols - 2));
          const gy = 1 + Math.floor(rng() * (ctx.rows - 2));
          if (!ctx.field.spawnable(gx, gy)) continue; // no pines in water
          if (ctx.claimed(gx, gy)) continue; // hub, prefab, or boulder
          const q = Math.floor(hash2(gx, gy, ctx.gen.seed + 13) * 2147483647);
          ctx.out.spawns.push({
            preset: "tree",
            gx: gx,
            gy: gy,
            yaw: (q % 4) * 90,
            size: 0.8 + (q % 5) * 0.15, // 0.8..1.4 specimen variety
          });
        }
      },
    };
  },

  /**
   * rock clusters — one `rock` preset entity per cluster (the vox boulder mesh, stretched over
   * the w×h cells; the adapter gives it the same solid footprint the old wall rect had); kept
   * off the 1-cell level border so a cluster never merges into the world-border wall or blocks an
   * entrance, and claimed so later scatters don't stand inside the boulder
   */
  rocks() {
    return {
      salt: 2,
      density: 5.9,
      apply(ctx) {
        const rng = ctx.rng;
        const rocks = OverworldGen.count(ctx, this.density);
        for (let i = 0; i < rocks; i++) {
          const w = 1 + Math.floor(rng() * 2);
          const h = 1 + Math.floor(rng() * 2);
          const gx = 1 + Math.floor(rng() * (ctx.cols - 2 - w));
          const gy = 1 + Math.floor(rng() * (ctx.rows - 2 - h));
          if (!ctx.free(gx, gy, w, h)) continue;
          ctx.claim(gx, gy, w, h);
          // random quarter-turn facing so the one boulder mesh doesn't visibly repeat —
          // by POSITION HASH, not the pass rng (no extra stream draws, so placement is
          // untouched). A stretched oblong cluster only takes 0/180: the per-cluster
          // scale is model-space before the yaw, so 90/270 would swing the long axis
          // out of the cell-rect BBox. Square clusters take any quarter turn.
          const q = Math.floor(hash2(gx, gy, ctx.gen.seed + 11) * 2147483647);
          ctx.out.spawns.push({
            preset: "rock",
            gx: gx,
            gy: gy,
            w: w,
            h: h,
            yaw: w === h ? (q % 4) * 90 : (q % 2) * 180,
          });
        }
      },
    };
  },

  /**
   * wandering rats are the ambient wildlife; raiders stay the camp/quest enemy (raider_camp prefab)
   */
  rats() {
    return {
      salt: 3,
      density: 3.9,
      apply(ctx) {
        const rng = ctx.rng;
        const rats = OverworldGen.count(ctx, this.density);
        for (let i = 0; i < rats; i++) {
          const gx = 1 + Math.floor(rng() * (ctx.cols - 2));
          const gy = 1 + Math.floor(rng() * (ctx.rows - 2));
          // keep wildlife off water (no swimming spawns; deep water would snag it)
          if (!ctx.field.spawnable(gx, gy)) continue;
          if (ctx.claimed(gx, gy)) continue;
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

  /** placements a density (per 1000 cells) asks for on this level */
  count(ctx, density) {
    return Math.round((density * ctx.cols * ctx.rows) / 1000);
  },

  /** wilderness raider loot table (the PrefabStamp defaultLoot policy) */
  rollLoot(rng) {
    const loot = [{ itemId: "rags", qty: 1 + Math.floor(rng() * 2) }];
    const roll = rng();
    if (roll > 0.85) loot.push({ itemId: "circuitry", qty: 1 });
    else if (roll > 0.6)
      loot.push({ itemId: "coin", qty: 1 + Math.floor(rng() * 3) });
    return loot;
  },
};

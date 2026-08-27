/**
 * The colony's level generator COMPOSITION — the stages a biome profile (contentBiomes.BIOMES)
 * selects and tunes, in order, the way a scene composes its render passes:
 *   GROUND      GenGround over `ground` (the noise base — always)
 *   LAKES       GenLakes over `lakes` (when the profile has one)
 *   ANCHOR      GenAnchor — the site's one fixed prefab (the colony compound, a landing pad, a
 *               cave mouth), on dry ground nearest the centre, its surroundings claimed
 *   WALLS       GenWalls over `walls` (a cave's noise shell — when the profile has one)
 *   STRUCTURES  PrefabStamp over `prefabs` (the tag's prefab set at its density — when present),
 *               carrying the colony spawn policy below
 *   ENTITIES    one GenScatter per `scatter` key, each placing what SCATTER's entry describes
 * A frozen basin, a marsh and a lava tube are profile entries over this one composition — a stage
 * is present exactly when its profile section is, so a new kind of level is data, and a genuinely
 * new stage is one more Gen* pass slotted in here.
 *
 * Contract: `create` returns the LevelGen the level builder holds — generate(cols, rows) →
 * { tiles, zones, spawns, terrain, solid } (grid coords, deterministic from (seed, pass salt): the
 * same seed rebuilds the same level, and each pass draws from its OWN salted stream, so adding/
 * removing a pass never reshuffles the others' output) — plus the `palette` the terrain layer is
 * typed by and paint(). A generator runs at a map's FIRST build only; a save keeps the grid it
 * painted, never the seed. Register prefabs before calling (GenAnchor/PrefabStamp resolve them).
 * GMRT-safe: index loops, namespace object on globalThis.
 */

globalThis.OverworldGen = {
  /**
   * Build a level generator. opts: { seed, biome, anchor, clear, spawnFilter, defaultLoot } —
   * `biome` the contentBiomes.BIOMES profile (default steppe); `anchor` the Prefab id GenAnchor
   * fixes (required), `clear` the cells claimed around it (default 0); the last two override the
   * colony spawn policy (see PrefabStamp).
   */
  create(opts = {}) {
    const seed = (opts.seed ?? 1337) | 0;
    const biome = opts.biome ?? contentBiomes.BIOMES.steppe;
    if (typeof opts.anchor !== "string")
      throw new Error("OverworldGen: a level needs an anchor prefab");
    const passes = [
      new GenGround({
        salt: 1,
        lattice: biome.ground.lattice,
        bands: biome.ground.bands,
      }),
    ];
    if (biome.lakes !== undefined)
      passes.push(
        new GenLakes({
          salt: 2,
          lattice: biome.lakes.lattice,
          bands: biome.lakes.bands,
        }),
      );
    passes.push(
      new GenAnchor({
        salt: 3,
        prefab: opts.anchor,
        margin: opts.clear ?? 0,
        edge: 2, // the border wall + one clear cell
        fill: biome.ground.bands[0][0], // the lowest ground band — a drained lake floor
      }),
    );
    if (biome.walls !== undefined)
      passes.push(
        new GenWalls({
          salt: 4,
          lattice: biome.walls.lattice,
          threshold: biome.walls.threshold,
          material: biome.walls.material,
          border: biome.walls.border,
        }),
      );
    if (biome.prefabs !== undefined)
      passes.push(
        new PrefabStamp({
          tag: biome.prefabs.tag,
          salt: 5,
          density: biome.prefabs.density,
          tries: biome.prefabs.tries,
          // Colony spawn policy: mobile combatants (raider) stay off water — nothing spawns
          // swimming, and deep water's collider would snag a dynamic body
          spawnFilter:
            opts.spawnFilter ??
            ((s, ctx) => s.preset !== "raider" || ctx.spawnable(s.gx, s.gy)),
          // a raider that authored no loot rolls the wilderness table
          defaultLoot:
            opts.defaultLoot ??
            ((s, rng) =>
              s.preset === "raider" && s.loot === undefined
                ? OverworldGen.rollLoot(rng)
                : undefined),
        }),
      );
    const scatter = biome.scatter ?? {};
    const keys = Object.keys(scatter);
    for (let i = 0; i < keys.length; i++) {
      const make = OverworldGen.SCATTER[keys[i]];
      if (make === undefined)
        throw new Error(`OverworldGen: unknown scatter "${keys[i]}"`);
      passes.push(make(scatter[keys[i]]));
    }
    return new LevelGen({
      seed: seed,
      palette: OverworldGen.palette(biome),
      passes: passes,
    });
  },

  /**
   * The material palette a biome profile describes: its lake bands (lowest first) then its ground
   * bands, each a MATERIALS row. Index = material id = painter order (the terrain layer's TileTypes
   * and the stacked dual-grid passes are built from it, lowest material first so an upper one's
   * transparent corners reveal the one below). A material listed twice throws — two bands would
   * silently share one id.
   */
  palette(biome) {
    const out = [];
    const bands = [];
    if (biome.lakes !== undefined)
      for (let i = 0; i < biome.lakes.bands.length; i++)
        bands.push(biome.lakes.bands[i][0]);
    for (let i = 0; i < biome.ground.bands.length; i++)
      bands.push(biome.ground.bands[i][0]);
    for (let i = 0; i < bands.length; i++) {
      if (bands.indexOf(bands[i]) !== i)
        throw new Error(
          `OverworldGen: material "${bands[i]}" listed twice in a profile`,
        );
      out.push(OverworldGen._material(bands[i]));
    }
    return out;
  },

  /** a fresh palette entry for a MATERIALS id; unknown id throws */
  _material(id) {
    const m = contentBiomes.MATERIALS[id];
    if (m === undefined)
      throw new Error(`OverworldGen: unknown terrain material "${id}"`);
    const e = {
      id: id,
      name: m.name,
      sprite: m.sprite,
      color: m.color,
      pathCost: m.pathCost,
    };
    if (m.spawnable !== undefined) e.spawnable = m.spawnable;
    return e;
  },

  /**
   * The scatter table: profile `scatter` key → the GenScatter placing that kind at the profile's
   * density (per 1000 cells). Each carries its own salt, so a profile listing a subset draws the
   * same placements for the kinds it keeps. Position hashes key on the pass seed, drawing nothing
   * from the stream, so a variant's look never shifts its placement.
   */
  SCATTER: {
    /**
     * rock clusters — one `rock` preset entity per cluster (the vox boulder mesh, stretched over
     * the w×h cells); claimed so later scatters don't stand inside the boulder
     */
    rock(density) {
      return new GenScatter({
        salt: 6,
        density: density,
        claim: true,
        size(rng) {
          return { w: 1 + Math.floor(rng() * 2), h: 1 + Math.floor(rng() * 2) };
        },
        spawn(ctx, gx, gy, w, h) {
          // quarter-turn facing so the one boulder mesh doesn't visibly repeat. A stretched
          // oblong cluster only takes 0/180: the per-cluster scale is model-space before the
          // yaw, so 90/270 would swing the long axis out of the cell-rect BBox.
          const q = Math.floor(hash2(gx, gy, ctx.seed) * 2147483647);
          return {
            preset: "rock",
            gx: gx,
            gy: gy,
            w: w,
            h: h,
            yaw: w === h ? (q % 4) * 90 : (q % 2) * 180,
          };
        },
      });
    },

    /**
     * scattered pines — one solid `tree` preset entity each (trunk collider, overhanging canopy
     * mesh), with a position-hashed quarter-turn + size so the one model doesn't visibly repeat
     */
    tree(density) {
      return new GenScatter({
        salt: 7,
        density: density,
        spawn(ctx, gx, gy) {
          const q = Math.floor(hash2(gx, gy, ctx.seed) * 2147483647);
          return {
            preset: "tree",
            gx: gx,
            gy: gy,
            yaw: (q % 4) * 90,
            size: 0.8 + (q % 5) * 0.15, // 0.8..1.4 specimen variety
          };
        },
      });
    },

    /** wandering rats, the ambient wildlife; raiders stay the camp/quest enemy (prefabs) */
    rat(density) {
      return new GenScatter({
        salt: 8,
        density: density,
        spawn(ctx, gx, gy) {
          return {
            preset: "rat",
            gx: gx,
            gy: gy,
            hp: 2,
            loot: ctx.rng() > 0.5 ? [{ itemId: "rags", qty: 1 }] : [],
          };
        },
      });
    },
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

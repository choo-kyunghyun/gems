/**
 * The colony's level generator composition: the ordered stages a biome profile selects and
 * tunes. A stage is present exactly when its profile section is, so a new kind of level is data
 * and a genuinely new stage is one more pass slotted in here.
 *
 * Generation is deterministic from the seed, and each pass draws from its own salted stream, so
 * adding or removing a pass never reshuffles the others' output. A generator runs at a map's
 * first build only; a save keeps the grid, never the seed. Prefabs must be registered before
 * calling.
 */

globalThis.OverworldGen = {
  /**
   * opts: { seed, biome, anchor, clear, spawnFilter, defaultLoot }. `anchor` is the required
   * fixed prefab id and `clear` the cells claimed around it; the last two override the colony
   * spawn policy.
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
        fill: biome.ground.bands[0][0], // a drained lake floor
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
          // Raiders stay off water: nothing spawns swimming, and deep water's collider would
          // snag a dynamic body.
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
    if (biome.flora !== undefined) passes.push(OverworldGen.flora(biome.flora));
    return new LevelGen({
      seed: seed,
      palette: OverworldGen.palette(biome),
      passes: passes,
    });
  },

  /**
   * The biome's material palette. Index = material id = painter order, lowest first, so an upper
   * material's transparent corners reveal the one below. A material listed twice throws, since
   * two bands would silently share one id.
   */
  palette(biome) {
    const out = [];
    const bands = [];
    if (biome.lakes !== undefined)
      for (let i = 0; i < biome.lakes.bands.length; i++)
        bands.push(biome.lakes.bands[i][0]);
    for (let i = 0; i < biome.ground.bands.length; i++)
      bands.push(biome.ground.bands[i][0]);
    if (biome.extras !== undefined)
      for (let i = 0; i < biome.extras.length; i++) bands.push(biome.extras[i]);
    for (let i = 0; i < bands.length; i++) {
      if (bands.indexOf(bands[i]) !== i)
        throw new Error(
          `OverworldGen: material "${bands[i]}" listed twice in a profile`,
        );
      out.push(OverworldGen._material(bands[i]));
    }
    return out;
  },

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
   * Profile `scatter` key → its pass at a per-1000-cell density. Each carries its own salt, so a
   * profile listing a subset draws the same placements for the kinds it keeps.
   */
  SCATTER: {
    /** One boulder per cluster, claimed so later scatters don't stand inside it. */
    rock(density) {
      return new GenScatter({
        salt: 6,
        density: density,
        claim: true,
        size(rng) {
          return { w: 1 + Math.floor(rng() * 2), h: 1 + Math.floor(rng() * 2) };
        },
        spawn(ctx, gx, gy, w, h) {
          return { preset: "rock", gx: gx, gy: gy, w: w, h: h };
        },
      });
    },

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

  /**
   * The biome's plant pool strewn at its per-1000 density, rooted only on each species' ground,
   * at a random maturity so a first-visit map carries a grown stand. The season is deliberately
   * not read: a seed must rebuild the same level. Salt 7 keeps existing seeds' stands in place.
   */
  flora(section) {
    const pool = section.pool;
    let total = 0;
    for (let i = 0; i < pool.length; i++) total += pool[i][1];
    return new GenScatter({
      salt: 7,
      density: section.density,
      spawn(ctx, gx, gy) {
        let roll = ctx.rng() * total;
        let species = pool[pool.length - 1][0];
        for (let i = 0; i < pool.length; i++) {
          roll -= pool[i][1];
          if (roll < 0) {
            species = pool[i][0];
            break;
          }
        }
        const def = contentFlora.get(species);
        if (def === undefined)
          throw new Error(`OverworldGen: unknown flora species "${species}"`);
        const mat = ctx.palette[ctx.materialAt(gx, gy)].id;
        if (def.ground.indexOf(mat) < 0) return undefined;
        const q = Math.floor(hash2(gx, gy, ctx.seed) * 2147483647);
        return {
          preset: def.preset,
          species: species,
          gx: gx,
          gy: gy,
          wild: true,
          progress: Math.min(1, ctx.rng() * 1.3), // ~a quarter ripe on arrival
          yaw: (q % 4) * 90,
          size: 0.8 + (q % 5) * 0.15,
        };
      },
    });
  },

  /** Wilderness raider loot table. */
  rollLoot(rng) {
    const loot = [{ itemId: "rags", qty: 1 + Math.floor(rng() * 2) }];
    const roll = rng();
    if (roll > 0.85) loot.push({ itemId: "circuitry", qty: 1 });
    else if (roll > 0.6)
      loot.push({ itemId: "coin", qty: 1 + Math.floor(rng() * 3) });
    return loot;
  },
};

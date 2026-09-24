/**
 * The growth and spread of a level's flora. Runs on the active map only, in in-game hours off one
 * whole-map clock: the hour the level was last grown to, under KEY. A parked map's clock simply
 * stops, so its first tick after a resume or a load spans the whole absence — the forest grows
 * while the squad is away, with no off-focus simulation. A span is cut at day boundaries, so each
 * day grows under its own season.
 *
 * Growth: progress advances by dh / growHours × the species' season weight; a weight of 0 halts
 * it, and kills a non-hardy crop. A ripe plant (progress ≥ 1) becomes interactable.
 *
 * Spread: only wild plants count and seed. Under the biome's flora cap each hour rolls seedings
 * off mature wild plants plus rolls of the biome pool at a random cell, so a species absent from
 * a map can still arrive. A level without a biome record grows but never spreads.
 */
globalThis.FloraSystem = {
  KEY: "flora", // a data key: a save holds it
  CAP: 1.5, // the flora cap, as a multiple of the biome's generation density
  SPREAD_RATE: 0.4, // expected seedings per in-game hour off mature wild plants (season weight 1)
  POOL_RATE: 0.05, // expected biome-pool rolls per in-game hour
  SPREAD_REACH: 3, // cells a seedling lands from its parent, per axis
  // scratch; structural changes land past the scan
  _mature: [],
  _ripe: [],
  _dead: [],

  /**
   * Grow the level up to now. Cheap when under an hour has passed; a first call on a map starts
   * its clock.
   */
  update(level) {
    const now = WorldClock.absHours();
    const rec = level.entities.of(level.self, FloraSystem.KEY, () => ({ lastHour: now }));
    if (now - rec.lastHour < 1) return;
    let t = rec.lastHour;
    while (t < now) {
      const dayEnd = (Math.floor(t / 24) + 1) * 24;
      const end = dayEnd < now ? dayEnd : now;
      FloraSystem._tick(level, t, end - t);
      t = end;
    }
    rec.lastHour = now;
  },

  /** One span of `dh` hours starting at hour `t`, all under t's season. */
  _tick(level, t, dh) {
    const entities = level.entities;
    const season = Season.at(t).id;
    const mature = FloraSystem._mature;
    const ripe = FloraSystem._ripe;
    const dead = FloraSystem._dead;
    let m = 0;
    let r = 0;
    let d = 0;
    let wild = 0;
    entities.forEach([Growth, Visual], (id, g, vis) => {
      const def = Flora.species(g.species);
      const mul = def.season[season] ?? 1;
      if (mul === 0) {
        if (def.hardy === false) {
          dead[d++] = id;
          return;
        }
      }
      if (g.wild) wild++;
      const was = g.progress;
      if (was < 1) {
        if (mul > 0) g.progress = Math.min(1, was + (dh * mul) / def.growHours);
      }
      if (g.progress >= 1) {
        if (was < 1) ripe[r++] = id;
        if (g.wild) mature[m++] = id;
      }
      Flora.stage(entities, id, g, vis, def);
    });
    for (let i = 0; i < r; i++) Flora.ripen(entities, ripe[i]);
    ripe.length = 0;
    if (d > 0) {
      for (let i = 0; i < d; i++) entities.remove(dead[i]);
      dead.length = 0;
      entities.flush(); // committed now, or the next day's span would queue them again
    }
    FloraSystem._spread(level, season, dh, wild, m);
    mature.length = 0;
  },

  /** The level biome's flora pool, or undefined. */
  _pool(level) {
    const id = level.entities.get(level.self, ColonyMap.BIOME);
    if (id === undefined) return undefined;
    const biome = contentBiomes.BIOMES[id];
    return biome === undefined ? undefined : biome.flora;
  },

  _spread(level, season, dh, wild, m) {
    const flora = FloraSystem._pool(level);
    if (flora === undefined) return;
    const grid = level.grid;
    const cap =
      (flora.density * FloraSystem.CAP * grid.cols * grid.rows) / 1000;
    if (wild >= cap) return;
    const entities = level.entities;
    const mature = FloraSystem._mature;
    const reach = FloraSystem.SPREAD_REACH;
    let n = m > 0 ? FloraSystem._draws(FloraSystem.SPREAD_RATE * dh) : 0;
    while (n > 0) {
      n--;
      const parent = mature[Math.floor(Math.random() * m)];
      const species = entities.get(parent, Growth).species;
      const def = Flora.species(species);
      if (Math.random() >= (def.season[season] ?? 1)) continue;
      const pos = entities.get(parent, Position);
      const c = grid.worldToGrid(pos.x, pos.y);
      const gx = c.x + FloraSystem._offset(reach);
      const gy = c.y + FloraSystem._offset(reach);
      if (Flora.canRoot(level, def, gx, gy)) Flora.plant(level, species, gx, gy);
    }
    // how a species reaches a map it is absent from
    n = FloraSystem._draws(FloraSystem.POOL_RATE * dh);
    while (n > 0) {
      n--;
      const species = FloraSystem._roll(flora.pool, season);
      if (species === undefined) continue;
      const gx = 1 + Math.floor(Math.random() * (grid.cols - 2));
      const gy = 1 + Math.floor(Math.random() * (grid.rows - 2));
      if (Flora.canRoot(level, Flora.species(species), gx, gy))
        Flora.plant(level, species, gx, gy);
    }
  },

  /** How many events an expected count yields: the whole part, plus one on the fraction. */
  _draws(expected) {
    let n = Math.floor(expected);
    if (Math.random() < expected - n) n++;
    return n;
  },

  _offset(reach) {
    return Math.floor(Math.random() * (2 * reach + 1)) - reach;
  },

  /** A season-weighted roll over [species, weight] entries; undefined when nothing seeds. */
  _roll(pool, season) {
    let total = 0;
    for (let i = 0; i < pool.length; i++)
      total += pool[i][1] * (Flora.species(pool[i][0]).season[season] ?? 1);
    if (total <= 0) return undefined;
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i][1] * (Flora.species(pool[i][0]).season[season] ?? 1);
      if (roll < 0) return pool[i][0];
    }
    return pool[pool.length - 1][0];
  },
};

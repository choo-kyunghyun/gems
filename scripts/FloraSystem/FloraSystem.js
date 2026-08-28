/**
 * The flora of a level — growth, spread and harvest of every plant, over the Growth component and
 * the contentFlora species table. Runs on the ACTIVE map only, like every system, but in IN-GAME
 * HOURS off one whole-map record: the level's flora clock (LevelMeta KEY → { lastHour }, the hour
 * the level was last grown to). A parked map's clock simply stops, so its first tick after a
 * resume or a load spans the whole absence and the forest grows while the squad is away — no
 * off-focus simulation, no scheduling. A span is cut at DAY boundaries, so a long absence still
 * grows each day under its own season.
 *
 * Growth: progress advances by dh / growHours × the species' season weight (0 halts it, and on a
 * non-hardy crop is the frost that kills it); the stage is floor(progress × (stages−1)), drawn as
 * a Mesh.scale factor over the specimen's base (one model per species, no per-stage art); a tree
 * turns solid from `solidFrom`; a ripe plant (progress ≥ 1) carries its species' Interaction
 * (harvest/chop — contentInteractions), which harvest() serves: the yield to the bag, then
 * progress falls back to `regrow` or the plant goes.
 *
 * Spread: only WILD plants (the generator's and their seedlings) count and seed. Under the biome's
 * flora cap (its generation density × CAP) each hour rolls SPREAD_RATE seedings — a mature wild
 * plant seeding a cell within SPREAD_REACH, on its species' season weight — plus POOL_RATE rolls
 * of the biome pool at a random cell, so a species absent from a map can still arrive. A cell
 * takes root when its terrain material is in the species' ground list, no build layer covers it
 * and nothing stands on it (canRoot — the test a built crop passes too). A level without a biome
 * record (a pre-flora save) grows but never spreads.
 *
 * Takes the scene (the map's runtime: terrainMats and the layer handles), like BuildMode.
 * GMRT-safe: index loops, structural changes buffered past the scan (ComponentStore.forEach).
 */
globalThis.FloraSystem = {
  KEY: "flora", // its LevelMeta key — a data key (a save holds it)
  MIN_SCALE: 0.25, // a seedling's Mesh.scale factor; the last stage draws at 1
  CAP: 1.5, // the flora cap, as a multiple of the biome's generation density
  SPREAD_RATE: 0.4, // expected seedings per in-game hour off mature wild plants (season weight 1)
  POOL_RATE: 0.05, // expected biome-pool rolls per in-game hour
  SPREAD_REACH: 3, // cells a seedling lands from its parent (per axis)
  _mature: [], // scratch: the tick's mature wild ids
  _ripe: [], // scratch: the ids that ripened this tick (their Interaction lands past the scan)
  _dead: [], // scratch: the ids the frost took
  _solidDirty: false, // a trunk flipped solid in place this pass (SolidSystem.invalidate)

  /** Species def by id; an unknown id throws (content is code — a retired id is a migration). */
  species(id) {
    const def = contentFlora.get(id);
    if (def === undefined)
      throw new Error(`FloraSystem: unknown species "${id}"`);
    return def;
  },

  /**
   * Grow the active map up to `now` (WorldClock.absHours). Cheap when under an hour has passed;
   * a first call on a map without the record starts its clock (the stand is the generator's).
   */
  update(scene, now) {
    const level = scene.level;
    const rec = level.meta.get(FloraSystem.KEY);
    if (rec === undefined) {
      level.meta.set(FloraSystem.KEY, { lastHour: now });
      return;
    }
    if (now - rec.lastHour < 1) return;
    let t = rec.lastHour;
    while (t < now) {
      const dayEnd = (Math.floor(t / 24) + 1) * 24;
      const end = dayEnd < now ? dayEnd : now;
      FloraSystem._tick(scene, t, end - t);
      t = end;
    }
    rec.lastHour = now;
  },

  /** One span of `dh` hours starting at hour `t`, all under t's season. */
  _tick(scene, t, dh) {
    const entities = scene.level.entities;
    const season = WorldClock.seasonAt(t).id;
    const mature = FloraSystem._mature;
    const ripe = FloraSystem._ripe;
    const dead = FloraSystem._dead;
    let m = 0;
    let r = 0;
    let d = 0;
    let wild = 0;
    FloraSystem._solidDirty = false;
    entities.forEach([Growth, Mesh], (id, g, mesh) => {
      const def = FloraSystem.species(g.species);
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
      FloraSystem._stage(entities, id, g, mesh, def);
    });
    for (let i = 0; i < r; i++) FloraSystem._ripen(entities, ripe[i]);
    ripe.length = 0;
    if (d > 0) {
      for (let i = 0; i < d; i++) entities.remove(dead[i]);
      dead.length = 0;
      entities.flush(); // committed now, or the next day's span would queue them again
    }
    if (FloraSystem._solidDirty) SolidSystem.invalidate();
    FloraSystem._spread(scene, season, dh, wild, m);
    mature.length = 0;
  },

  /** Apply the stage progress implies: the model's scale step, and a trunk turning solid. */
  _stage(entities, id, g, mesh, def) {
    const last = def.stages - 1;
    let stage = Math.floor(g.progress * last);
    if (stage > last) stage = last;
    if (stage === g.stage) return;
    g.stage = stage;
    mesh.scale =
      g.base *
      (FloraSystem.MIN_SCALE + (1 - FloraSystem.MIN_SCALE) * (stage / last));
    if (def.solidFrom === undefined) return;
    const col = entities.get(id, Collision);
    if (col === undefined) return;
    const solid = stage >= def.solidFrom;
    if (col.solid !== solid) {
      col.solid = solid; // flipped in place on a kinematic collider — the id-set fingerprint can't see it (the door's case)
      FloraSystem._solidDirty = true;
    }
  },

  _ripen(entities, id) {
    if (entities.has(id, Interaction)) return;
    const def = FloraSystem.species(entities.get(id, Growth).species);
    entities.add(id, Interaction, { kind: def.action });
  },

  /**
   * A freshly spawned plant (ColonySpawn, for any `species` descriptor): the specimen's base size
   * is the Mesh.scale the preset baked (its size variety), then its stage and, if already ripe,
   * its Interaction. A trunk set solid here needs no invalidate — the spawn is a new collider.
   */
  attach(entities, id) {
    const g = entities.get(id, Growth);
    const mesh = entities.get(id, Mesh);
    const def = FloraSystem.species(g.species);
    g.base = mesh.scale ?? 1;
    FloraSystem._stage(entities, id, g, mesh, def);
    if (g.progress >= 1) FloraSystem._ripen(entities, id);
  },

  /** The biome's flora pool for a level, or undefined (no biome record, or a biome without one). */
  _pool(level) {
    const id = level.meta.get(ColonyMap.BIOME);
    if (id === undefined) return undefined;
    const biome = contentBiomes.BIOMES[id];
    return biome === undefined ? undefined : biome.flora;
  },

  _spread(scene, season, dh, wild, m) {
    const flora = FloraSystem._pool(scene.level);
    if (flora === undefined) return;
    const grid = scene.level.grid;
    const cap =
      (flora.density * FloraSystem.CAP * grid.cols * grid.rows) / 1000;
    if (wild >= cap) return;
    const entities = scene.level.entities;
    const mature = FloraSystem._mature;
    const reach = FloraSystem.SPREAD_REACH;
    // seedlings off mature wild plants, each on its species' season weight
    let n = m > 0 ? FloraSystem._draws(FloraSystem.SPREAD_RATE * dh) : 0;
    while (n > 0) {
      n--;
      const parent = mature[Math.floor(Math.random() * m)];
      const species = entities.get(parent, Growth).species;
      const def = FloraSystem.species(species);
      if (Math.random() >= (def.season[season] ?? 1)) continue;
      const pos = entities.get(parent, Position);
      const c = grid.worldToGrid(pos.x, pos.y);
      const gx = c.x + FloraSystem._offset(reach);
      const gy = c.y + FloraSystem._offset(reach);
      if (FloraSystem.canRoot(scene, def, gx, gy))
        FloraSystem.plant(scene, species, gx, gy);
    }
    // the biome pool at a random cell — how a species reaches a map it is absent from
    n = FloraSystem._draws(FloraSystem.POOL_RATE * dh);
    while (n > 0) {
      n--;
      const species = FloraSystem._roll(flora.pool, season);
      if (species === undefined) continue;
      const gx = 1 + Math.floor(Math.random() * (grid.cols - 2));
      const gy = 1 + Math.floor(Math.random() * (grid.rows - 2));
      if (FloraSystem.canRoot(scene, FloraSystem.species(species), gx, gy))
        FloraSystem.plant(scene, species, gx, gy);
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

  /**
   * A pool roll — [species, weight] entries, each weight × the species' season weight; undefined
   * when every weight is 0 (nothing seeds in that season).
   */
  _roll(pool, season) {
    let total = 0;
    for (let i = 0; i < pool.length; i++)
      total +=
        pool[i][1] * (FloraSystem.species(pool[i][0]).season[season] ?? 1);
    if (total <= 0) return undefined;
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -=
        pool[i][1] * (FloraSystem.species(pool[i][0]).season[season] ?? 1);
      if (roll < 0) return pool[i][0];
    }
    return pool[pool.length - 1][0];
  },

  /**
   * The terrain material id under a cell (contentBiomes.MATERIALS), read off the map's material
   * table (scene.terrainMats — ColonyLevel._terrainTypes); undefined off-grid, or on a map whose
   * saved rows predate the material column.
   */
  materialAt(scene, gx, gy) {
    const mats = scene.terrainMats;
    if (mats === undefined) return undefined;
    const t = scene.terrainLayer.get(gx, gy);
    for (let i = 0; i < mats.length; i++)
      if (mats[i].type === t) return mats[i].material;
    return undefined;
  },

  /**
   * Can `def` take root at a cell: inside the border margin, on its ground, under no build layer
   * or built entity, and with nothing standing on the cell — a body, a prop, another plant.
   */
  canRoot(scene, def, gx, gy) {
    const grid = scene.level.grid;
    if (gx < 1) return false;
    if (gy < 1) return false;
    if (gx >= grid.cols - 1) return false;
    if (gy >= grid.rows - 1) return false;
    const mat = FloraSystem.materialAt(scene, gx, gy);
    if (mat === undefined) return false;
    if (def.ground.indexOf(mat) < 0) return false;
    const lkeys = BuildMode.tileLayerKeys();
    for (let i = 0; i < lkeys.length; i++)
      if (TileEdit.occupied(scene[lkeys[i] + "Layer"], gx, gy)) return false;
    if (scene._builtEnts[gx + "," + gy] !== undefined) return false;
    const w = grid.gridToWorld(gx, gy);
    const hw = grid.cellWidth / 2;
    const hh = grid.cellHeight / 2;
    const stand = Query.inRect(
      scene.level.entities,
      w.x - hw,
      w.y - hh,
      w.x + hw,
      w.y + hh,
    );
    return stand.length === 0;
  },

  /** Put a wild seedling of `species` down at a cell (no root test — that is the caller's). */
  plant(scene, species, gx, gy) {
    const def = FloraSystem.species(species);
    return ColonySpawn.spawnEntity(scene.level.entities, scene.level.grid, {
      preset: def.preset,
      species: species,
      gx: gx,
      gy: gy,
      wild: true,
      progress: 0,
      yaw: Math.floor(Math.random() * 4) * 90,
      size: 0.8 + Math.floor(Math.random() * 5) * 0.15, // the generator's specimen range
    });
  },

  /**
   * The harvest/chop action: a ripe plant's yield to the player's bag — all or nothing, so a full
   * bag refuses rather than losing the rest — then the plant regrows or goes. Returns whether
   * anything was taken.
   */
  harvest(scene, id) {
    const entities = scene.level.entities;
    const g = entities.get(id, Growth);
    if (g === undefined) return false;
    if (g.progress < 1) return false;
    const def = FloraSystem.species(g.species);
    const inv = entities.get(scene.playerId, Inventory);
    if (inv === undefined) return false;
    const qty = def.yield.qty;
    const left = InventorySystem.add(inv, def.yield.itemId, qty);
    if (left > 0) {
      if (left < qty) InventorySystem.remove(inv, def.yield.itemId, qty - left);
      Toast.push(I18n.text("WB_BAG_FULL"), { type: "info" });
      return false;
    }
    scene._onCollect(def.yield.itemId, qty); // quest/achievement credit + the pickup blip
    scene._invDirty = true;
    Toast.push(
      I18n.text(
        "TOAST_HARVEST",
        qty,
        I18n.text(Item.get(def.yield.itemId).name),
      ),
      { type: "success" },
    );
    if (def.regrow !== undefined) {
      g.progress = def.regrow;
      entities.detach(id, Interaction);
      FloraSystem._solidDirty = false;
      FloraSystem._stage(entities, id, g, entities.get(id, Mesh), def);
      if (FloraSystem._solidDirty) SolidSystem.invalidate();
    } else entities.remove(id);
    return true;
  },
};

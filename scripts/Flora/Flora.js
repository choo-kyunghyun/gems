/**
 * The on-demand verbs over a plant (Growth) and its species def: what a stage change and ripeness
 * do to the entity, the placement test a seedling and a built crop share, and the harvest. One
 * sheet per species, a frame per stage. Growth over time is not here.
 */
globalThis.Flora = {
  /** An unknown id throws: content is code, so a retired id is a migration. */
  species(id) {
    const def = contentFlora.get(id);
    if (def === undefined) throw new Error(`Flora: unknown species "${id}"`);
    return def;
  },

  /** Apply the stage progress implies: the frame, and a trunk turning solid from `solidFrom`. */
  stage(entities, id, g, vis, def) {
    const last = def.stages - 1;
    let stage = Math.floor(g.progress * last);
    if (stage > last) stage = last;
    if (stage === g.stage) return;
    g.stage = stage;
    vis.subimg = stage;
    if (def.solidFrom === undefined) return;
    const col = entities.get(id, Collision);
    if (col === undefined) return;
    col.solid = stage >= def.solidFrom;
  },

  /** A ripe plant carries its species' Interaction. */
  ripen(entities, id) {
    if (entities.has(id, Interaction)) return;
    const def = Flora.species(entities.get(id, Growth).species);
    entities.add(id, Interaction, { kind: def.action });
  },

  /** Set up a freshly spawned plant: its stage frame and, if already ripe, its Interaction. */
  attach(entities, id) {
    const g = entities.get(id, Growth);
    const def = Flora.species(g.species);
    Flora.stage(entities, id, g, entities.get(id, Visual), def);
    if (g.progress >= 1) Flora.ripen(entities, id);
  },

  /** The terrain material id under a cell; undefined off-grid or on a map with no material table. */
  materialAt(level, gx, gy) {
    const rt = ColonyMap.runtime(level);
    const mats = rt.terrainMats;
    if (mats === undefined) return undefined;
    const t = rt.terrainLayer.get(gx, gy);
    for (let i = 0; i < mats.length; i++)
      if (mats[i].type === t) return mats[i].material;
    return undefined;
  },

  /**
   * Can `def` take root at a cell: inside the border margin, on its ground, under no build layer
   * or built entity, and with nothing standing on the cell — a body, a prop, another plant.
   */
  canRoot(level, def, gx, gy) {
    const grid = level.grid;
    if (gx < 1) return false;
    if (gy < 1) return false;
    if (gx >= grid.cols - 1) return false;
    if (gy >= grid.rows - 1) return false;
    const mat = Flora.materialAt(level, gx, gy);
    if (mat === undefined) return false;
    if (def.ground.indexOf(mat) < 0) return false;
    const rt = ColonyMap.runtime(level);
    const lkeys = contentBuild.tileLayers();
    for (let i = 0; i < lkeys.length; i++)
      if (rt[lkeys[i] + "Layer"].occupied(gx, gy)) return false;
    if (Build.of(level).builtEnts[gx + "," + gy] !== undefined)
      return false;
    const w = grid.gridToWorld(gx, gy);
    const hw = grid.cellWidth / 2;
    const hh = grid.cellHeight / 2;
    const stand = Query.inRect(
      level.entities,
      w.x - hw,
      w.y - hh,
      w.x + hw,
      w.y + hh,
    );
    return stand.length === 0;
  },

  /** A wild seedling at a cell; the root test is the caller's. */
  plant(level, species, gx, gy) {
    const def = Flora.species(species);
    return ColonySpawn.spawnEntity(level.entities, level.grid, {
      preset: def.preset,
      species: species,
      gx: gx,
      gy: gy,
      wild: true,
      progress: 0,
      yaw: Math.floor(Math.random() * 4) * 90,
      size: 0.8 + Math.floor(Math.random() * 5) * 0.15, // matches the generated specimen range
    });
  },

  /**
   * A ripe plant's yield to `playerId`'s bag — all or nothing, so a full bag refuses rather than
   * losing the rest — then the plant regrows or goes. `qty` 0 with `reason` "" for an unripe
   * plant, "INV_FULL" for a refused bag.
   */
  harvest(entities, id, playerId) {
    const g = entities.require(id, Growth);
    if (g.progress < 1) return { itemId: "", qty: 0, reason: "" };
    const def = Flora.species(g.species);
    const inv = entities.require(playerId, Inventory);
    const qty = def.yield.qty;
    const left = Bag.add(inv, def.yield.itemId, qty);
    if (left > 0) {
      if (left < qty) Bag.remove(inv, def.yield.itemId, qty - left);
      return { itemId: def.yield.itemId, qty: 0, reason: "INV_FULL" };
    }
    if (def.regrow !== undefined) {
      g.progress = def.regrow;
      entities.detach(id, Interaction);
      Flora.stage(entities, id, g, entities.get(id, Visual), def);
    } else entities.remove(id);
    return { itemId: def.yield.itemId, qty: qty, reason: "" };
  },
};

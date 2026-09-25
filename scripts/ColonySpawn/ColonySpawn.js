/**
 * Entity construction for colony levels — the one place a spawn descriptor becomes an entity.
 *
 * An entity kind is a preset def with two hooks it owns: `adapt(s, over, ctx)` turns its own
 * descriptor fields into per-spawn component overrides, and `post(entities, id, ctx)` wires what
 * data can't express once the id exists, reading the descriptor off `ctx.opts.descriptor`. This
 * module handles only the fields every descriptor takes, so a new kind, or a new field on one, is
 * a def entry, never an edit here.
 *
 * Every descriptor takes `preset` and grid coords `gx/gy`, plus `label?` (its Name), `size?` (a
 * per-spawn scalar on the def's scale), `settlement?` (the map whose settlement it is a Resident
 * of) and, on mesh spawns, `yaw?` (a visual turn in degrees; the collider stays axis-aligned).
 *
 * The helpers below `_spawn` are the hooks' vocabulary, so a preset states its rule in one line.
 */
globalThis.ColonySpawn = {
  /**
   * Collider footprint for a mesh model from its content dims, in world px: erring small for
   * walkability, with a floor that keeps thin content solid. Undefined for an unknown model.
   */
  footprint(model) {
    let content;
    const p = Poly.load(model);
    if (p !== undefined) content = p.content;
    else {
      const m = Vox.load(model);
      if (m !== undefined) content = m.content;
    }
    if (content === undefined) return undefined;
    return {
      w: Math.max(8, content[0] - 2),
      h: Math.max(8, content[1] - 2),
    };
  },

  /** World rect for a "reach" spawn — a region, not an entity. */
  reachZone(grid, s) {
    const w = grid.gridToWorld(s.gx, s.gy);
    const half = s.half ?? 44;
    return { x1: w.x - half, y1: w.y - half, x2: w.x + half, y2: w.y + half };
  },

  /** Returns the entity id, or -1 for a marker preset, which is no entity. Off-grid cells work. */
  spawnEntity(entities, grid, s) {
    if (!EntityPreset.has(s.preset)) return -1;
    return ColonySpawn._spawn(entities, grid, s, grid.gridToWorld(s.gx, s.gy));
  },

  /**
   * Spawn a companion at world coords, taking the follower descriptor's fields as `opt`. Its
   * cell-keyed hashes key on the world point instead.
   */
  spawnFollower(entities, wx, wy, opt = {}) {
    const s = { ...opt, preset: "follower", gx: Math.round(wx), gy: Math.round(wy) };
    return ColonySpawn._spawn(entities, undefined, s, { x: wx, y: wy });
  },

  /** The adapter proper, over a world point `w` a preset's adapt may move. */
  _spawn(entities, grid, s, w) {
    const def = EntityPreset.get(s.preset);
    const over = {};
    if (s.label !== undefined) over.Name = { name: s.label };
    if (def.adapt !== undefined) def.adapt(s, over, { grid, w });
    // mesh-bearing spawns only: a bare Mesh on a sprite entity has no dims. The collider stays
    // axis-aligned, so a 90° turn of oblong furniture authors the swapped footprint.
    if (s.yaw !== undefined) {
      if (
        over.Mesh !== undefined ||
        (def.components !== undefined && def.components[Mesh] !== undefined)
      )
        over.Mesh = { ...(over.Mesh ?? {}), yaw: s.yaw };
    }
    const id = EntityPreset.spawn(entities, s.preset, w.x, w.y, 0, {
      size: s.size,
      components: over,
      grid,
      descriptor: s,
    });
    // explicit membership only, never by location
    if (s.settlement !== undefined) Residency.assign(entities, id, s.settlement);
    return id;
  },

  /** A mob's descriptor fields: `hp` and `loot`. */
  adaptMob(s, over) {
    if (s.hp !== undefined) {
      over.Health = { hp: s.hp };
      over.Stats = { maxHp: s.hp };
    }
    if (s.loot !== undefined) over.Inventory = { slots: s.loot };
  },

  /**
   * A merchant's `merchant` descriptor: the trade config and a stock of its own goods, added item
   * by item so instanced gear is minted; weightless, so a vendor is never encumbered.
   */
  merchant(entities, id, mc) {
    const mInv = { slots: [], capacity: mc.capacity ?? 32 };
    const stock = mc.stock ?? [];
    for (let i = 0; i < stock.length; i++)
      Bag.add(mInv, stock[i].itemId, stock[i].qty);
    entities.add(id, Inventory, mInv);
    entities.add(id, Merchant, {
      currencyId: mc.currencyId,
      buyMargin: mc.buyMargin,
      sellMargin: mc.sellMargin,
      infinite: mc.infinite,
      credits: mc.credits,
      restockSecs: mc.restockSecs,
      restockTimer: mc.restockSecs,
      template: mc.template,
    });
  },

  /** A strewn prop mirrors by cell hash so one sheet doesn't visibly repeat. */
  mirror(entities, id, s) {
    if (hash2(s.gx, s.gy, 11) < 0.5) {
      const spr = entities.require(id, Sprite);
      spr.xscale = -spr.xscale;
    }
  },

  adaptFlora(s, over) {
    if (s.species !== undefined) ColonySpawn._flora(s, over);
  },

  postFlora(entities, id, ctx) {
    const s = ctx.opts.descriptor;
    if (s.species === undefined) return;
    Flora.attach(entities, id);
    ColonySpawn.mirror(entities, id, s);
  },

  /** A species' per-spawn overrides; throws on an unknown species. */
  _flora(s, over) {
    const def = contentFlora.get(s.species);
    if (def === undefined)
      throw new Error(`ColonySpawn: unknown flora species "${s.species}"`);
    over.Sprite = { sprite: def.sprite, speed: 0 }; // a frame per growth stage
    over.Name = { name: I18n.text(def.name) };
    over.Growth = {
      species: s.species,
      progress: s.progress,
      wild: s.wild === true,
    };
  },

  // tints over the white body art
  SKINS: ["#e8b890", "#d19a6b", "#a2714c"],

  // the body parts only: a garment or gear slot keeps its authored colours, which a whole-rig
  // colour would wash
  SKIN_SLOTS: ["head", "eyes", "mouth", "neck", "torso", "armL", "armR", "handL", "handR", "legL", "legR", "footLB", "footLF", "footRB", "footRF"],

  /** The slot -> colour tint map. */
  skinTints(color) {
    const tints = {};
    for (let j = 0; j < ColonySpawn.SKIN_SLOTS.length; j++)
      tints[ColonySpawn.SKIN_SLOTS[j]] = color;
    return tints;
  },

  /** Hashed from the spawn cell, so a regenerated level's humanoid keeps the same face. */
  skin(s) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    const i = Math.abs(gx * 7 + gy * 13) % ColonySpawn.SKINS.length;
    return Color.parse(ColonySpawn.SKINS[i]);
  },

  // tints over the white body art; white is as authored
  COATS: ["#ffffff", "#b4b4b4", "#a06a3c", "#585858"],
  // the furred parts only
  COAT_SLOTS: ["torso", "head", "legF", "legB"],

  /** Cell-hashed like skin; returns the slot -> colour tint map. */
  coat(s) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    const i = Math.abs(gx * 11 + gy * 17) % ColonySpawn.COATS.length;
    const color = Color.parse(ColonySpawn.COATS[i]);
    const tints = {};
    for (let j = 0; j < ColonySpawn.COAT_SLOTS.length; j++)
      tints[ColonySpawn.COAT_SLOTS[j]] = color;
    return tints;
  },

  /**
   * Cell-hashed like skin, over an age band; distinct seeds keep sex, age and skin independent.
   */
  persona(s, minAge, maxAge) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    return {
      sex: hash2(gx, gy, 7717) < 0.5 ? "male" : "female",
      age: minAge + Math.floor(hash2(gx, gy, 3373) * (maxAge - minAge + 1)),
    };
  },

  /**
   * An outfit as a slot map, one sprite per slot: a slot has no tint of its own, so an outfit
   * varies by art, never by colour. `hat` is optional.
   */
  outfit(shirt, shoe, hat) {
    const slots = { shirt: shirt, shoeL: shoe, shoeR: shoe };
    if (hat !== undefined) slots.hat = hat;
    return { slots: slots, dirty: true };
  },
};

/**
 * Entity construction for colony levels — the one place a spawn descriptor becomes an entity.
 *
 * The entity kinds are EntityPreset DEFS (contentPresets — registered by content.register) —
 * component data + design scale + two hooks the def owns: `adapt(s, over, ctx)` turns its own
 * descriptor fields into per-spawn component overrides (field-merged onto the def like a variant)
 * and `post(entities, id, ctx)` wires what data can't express once the id exists (CombatAI.attach,
 * a merchant's stock), reading the descriptor off `ctx.opts.descriptor`. spawnEntity does the
 * grid→world and the fields EVERY descriptor takes, then hands the preset its own — so a new kind,
 * or a new field on one, is a def entry, never an edit here. A fresh map's descriptors
 * (ColonyMap.populate — the file's and the generator's alike), BuildMode, FloraSystem and the
 * Trader all route through it; a variant preset (`extends: "raider"`) inherits its base's hooks.
 *
 * Every descriptor takes `preset` and grid coords `gx/gy`, plus `label?` (its Name), `size?` — the
 * per-spawn SCALAR (Alpha/boss knob) multiplying the def's `scale` across BBox + Visual + Mesh
 * (see EntityPreset.spawn — AssetMeta density divides the DRAW scale separately) —
 * `settlement?` (the map whose settlement it is a Resident of) and, on mesh spawns, `yaw?`, a
 * visual turn in degrees (BBox stays axis-aligned). A preset's own fields are on its def.
 *
 * The helpers below `_spawn` are the hooks' vocabulary — what a def's adapt/post calls — so a
 * preset states its rule in one line over them.
 */
globalThis.ColonySpawn = {
  /**
   * Collider footprint for a mesh model, derived from its tight content dims — a poly bake's
   * header (Poly) or the vox extent (Vox), the same shadowing order RenderMesh draws by:
   * max(8, content − 2) per axis — BBox ≤ content, erring small for walkability
   * (reproduces the retired hand table; the floor of 8 keeps thin content like the sign's
   * 4px plank robustly solid). 1 unit = 1 world px; big furniture is genuinely multi-cell
   * (a 60px bench = ~2×1 cells at the 32px cell), so the collider must match the art, not
   * the one-size prop preset box. Returns undefined for an unknown model.
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

  /**
   * Reach-quest zone rect (world coords) for a "reach" spawn — a region, not an entity.
   */
  reachZone(grid, s) {
    const w = grid.gridToWorld(s.gx, s.gy);
    const half = s.half ?? 44;
    return { x1: w.x - half, y1: w.y - half, x2: w.x + half, y2: w.y + half };
  },

  /**
   * Construct ONE spawn descriptor's entity, returning its id (-1 for a marker preset — reach,
   * entry — which is no entity). `gx/gy` are grid coords (gridToWorld handles negatives, so an
   * off-grid descriptor works too).
   */
  spawnEntity(entities, grid, s) {
    if (!EntityPreset.has(s.preset)) return -1;
    return ColonySpawn._spawn(entities, grid, s, grid.gridToWorld(s.gx, s.gy));
  },

  /**
   * Spawn a companion at WORLD coords through the `follower` preset — the scene's programmatic
   * party seed, taking the follower descriptor's fields as `opt`. The skin/persona hash keys on
   * gx/gy, so a world-placed companion hashes its world point.
   */
  spawnFollower(entities, wx, wy, opt = {}) {
    const s = { ...opt, preset: "follower", gx: Math.round(wx), gy: Math.round(wy) };
    return ColonySpawn._spawn(entities, undefined, s, { x: wx, y: wy });
  },

  /**
   * The adapter proper, over a resolved world point `w` (a preset's adapt may move it — the rock
   * centres on its cluster): the fields every descriptor takes, the preset's `adapt`, the spawn
   * with the descriptor riding `opts` to `post`, then the membership every preset may state.
   */
  _spawn(entities, grid, s, w) {
    const def = EntityPreset.get(s.preset);
    const over = {};
    if (s.label !== undefined) over.Name = { name: s.label };
    if (def.adapt !== undefined) def.adapt(s, over, { grid, w });
    // visual yaw for any mesh look (`yaw?`, degrees — vox meshes carry all four sides, so any
    // facing is solid). Gated to mesh-bearing spawns: on a sprite entity (fence) a bare
    // Mesh {yaw} would send RenderMesh's box path NaN dims. BBox stays axis-aligned —
    // author the swapped footprint for 90° turns of oblong furniture.
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
      grid, // post hooks (CombatAI.attach) read ctx.opts.grid
      descriptor: s, // post hooks read their preset's fields off it
    });
    // Settlement membership (any preset): `settlement: <map id>` makes the entity a Resident of that
    // level's settlement through the inhabitant seam. Explicit — no auto-by-location.
    if (s.settlement !== undefined) Residency.assign(entities, id, s.settlement);
    return id;
  },

  /** A mob's descriptor fields (raider/rat): `hp` seeds Health + maxHp, `loot` the Inventory. */
  adaptMob(s, over) {
    if (s.hp !== undefined) {
      over.Health = { hp: s.hp };
      over.Stats = { maxHp: s.hp };
    }
    if (s.loot !== undefined) over.Inventory = { slots: s.loot };
  },

  /**
   * A merchant NPC's `merchant` descriptor: the trade config + a stock Inventory (its OWN goods);
   * its `trade` Interaction opens TradeUI on E. Stock built via Bag.add so instanced gear gets a
   * uid/mods; weightless (no maxWeight) so a vendor isn't encumbered.
   */
  merchant(entities, id, mc) {
    const mInv = { slots: [], capacity: mc.capacity ?? 32 };
    const stock = mc.stock ?? [];
    for (let i = 0; i < stock.length; i++)
      Bag.add(mInv, stock[i].itemId, stock[i].qty);
    entities.add(id, Inventory, mInv);
    entities.add(id, Merchant, {
      currencyId: mc.currencyId ?? "coin",
      buyMargin: mc.buyMargin ?? 1.25,
      sellMargin: mc.sellMargin ?? 0.5,
      infinite: mc.infinite ?? false,
      credits: mc.credits ?? 0,
      restockSecs: mc.restockSecs ?? 0,
      restockTimer: mc.restockSecs ?? 0,
      template: mc.template,
    });
  },

  /**
   * A strewn prop's facing: a boulder or plant mirrors by cell hash so one sheet doesn't visibly
   * repeat — the sign of Visual.xscale, the same facing knob a mover turns.
   */
  mirror(entities, id, s) {
    if (hash2(s.gx, s.gy, 11) < 0.5) {
      const vis = entities.require(id, Visual);
      vis.xscale = -vis.xscale;
    }
  },

  /** The flora presets' adapt: a `species` (contentFlora) brings its model, name and Growth. */
  adaptFlora(s, over) {
    if (s.species !== undefined) ColonySpawn._flora(s, over);
  },

  /** The flora presets' post: a species' stage frame and (if ripe) Interaction, then the mirror. */
  postFlora(entities, id, ctx) {
    const s = ctx.opts.descriptor;
    if (s.species === undefined) return;
    Flora.attach(entities, id);
    ColonySpawn.mirror(entities, id, s);
  },

  /**
   * A flora species' per-spawn overrides: the species' sprite sheet and name, and its Growth
   * record (progress as authored, default a seedling; `wild` marks the generator's and the
   * spread's). The stage frame and the ripe Interaction are Flora.attach's, after the spawn.
   */
  _flora(s, over) {
    const def = contentFlora.get(s.species);
    if (def === undefined)
      throw new Error(`ColonySpawn: unknown flora species "${s.species}"`);
    over.Visual = { sprite: def.sprite };
    over.Name = { name: I18n.text(def.name) };
    over.Growth = {
      species: s.species,
      progress: s.progress ?? 0,
      stage: -1,
      wild: s.wild === true,
    };
  },

  // Skin tones for doll humanoids (slot tints over the white spineHuman body art).
  SKINS: ["#e8b890", "#d19a6b", "#a2714c"],

  // the slots skin shows through: spineHuman's authored body parts. A garment or gear slot is
  // NOT here, so it keeps its authored colours — whole-rig `color` would wash it (image_blend composes over every slot).
  SKIN_SLOTS: ["head", "eyes", "mouth", "neck", "torso", "armL", "armR", "handL", "handR", "legL", "legR", "footLB", "footLF", "footRB", "footRF"],

  /** one skin tone over every SKIN_SLOT — the slot -> colour map for Skeleton.tints */
  skinTints(color) {
    const tints = {};
    for (let j = 0; j < ColonySpawn.SKIN_SLOTS.length; j++)
      tints[ColonySpawn.SKIN_SLOTS[j]] = color;
    return tints;
  },

  /**
   * deterministic skin pick — hashed from the spawn CELL so a regenerated level's humanoid
   * keeps the same face (a seed must rebuild the same level — see LevelGen)
   */
  skin(s) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    const i = Math.abs(gx * 7 + gy * 13) % ColonySpawn.SKINS.length;
    return Color.parse(ColonySpawn.SKINS[i]);
  },

  // Coat colours for rats (Skeleton.tints over the white spineRat body art; white = as authored).
  COATS: ["#ffffff", "#b4b4b4", "#a06a3c", "#585858"],
  // the slots a coat covers: the furred parts — not `ear`/`feetF`/`feetB` (pink art of their
  // own) and not `tail` (outline only)
  COAT_SLOTS: ["torso", "head", "legF", "legB"],

  /** deterministic coat pick, cell-hashed like skin — the slot -> colour map for Skeleton.tints */
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
   * Deterministic persona pick, banded by the caller's role — hashed from the spawn CELL like
   * skin, so a regenerated level keeps the same colonist. Two distinct hash2 seeds so sex and age
   * are independent of each other and of the skin tone.
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
   * Authored outfit as a spineHuman slot map — one sprite per slot, in its own colours (a Spine
   * slot has no tint of its own, so an outfit varies by ART, never by colour). `hat` is optional;
   * both shoes take the one sprite, mirrored by their bones.
   */
  outfit(shirt, shoe, hat) {
    const slots = { shirt: shirt, shoeL: shoe, shoeR: shoe };
    if (hat !== undefined) slots.hat = hat;
    return { slots: slots, dirty: true };
  },
};

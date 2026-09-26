// The colony's player: builds the player entity and owns its cursor-aimed hitscan
// firing and the cursor-to-world aim the shot resolves against.

// Silhouette px up a body that the cursor means when it is over no body at all. Bodies are drawn
// standing, so the cursor's ground point sits behind whatever it visibly covers; reading the plane
// this high cancels that.
const AIM_H = 16;

globalThis.ColonyPlayer = {
  // skin tint "#e8b890" as a BGR int — a literal, as top-level code runs in script load order
  // (docs/GMRT.md).
  // Worn as body-slot tints: a whole-rig color would wash the garments with it.
  SKIN: 0x90b8e8,

  // a 24 world px bbox (16 × 1.5): near the visual body so the sprite can't bury into walls, and
  // under the 32px cell so 1-cell doorways stay passable; speed in world px/s
  TUNING: {
    bbox: { x: -8, y: -8, width: 16, height: 16 },
    dir: { x: 0, y: 1, z: 0 },
    speed: 220,
    scale: 1.5,
  },

  /** The player entity, resolved live so a map transfer can't dangle it; -1 when none. */
  id(entities) {
    return entities.first(Playable);
  },

  /**
   * Create the player entity and return its id. `opts.scale` is a baked size factor over the
   * art-native 1.0, applied to both the bbox and the body. Boot only; a trip transfers the player.
   */
  spawn(entities, spawn, opts = ColonyPlayer.TUNING) {
    const k = opts.scale ?? 1;
    const id = entities.create();
    entities.add(id, Position, { x: spawn.x, y: spawn.y });
    entities.add(id, Velocity, {});
    entities.add(id, BBox, {
      x: opts.bbox.x * k,
      y: opts.bbox.y * k,
      width: opts.bbox.width * k,
      height: opts.bbox.height * k,
    });
    entities.add(id, Collision, {}); // a dynamic solid
    entities.add(id, Direction, opts.dir);
    entities.add(id, Name, { name: "Player" });
    // authored like the name, not hashed like a spawned colonist
    entities.add(id, Persona, { sex: "male", age: 34 });
    entities.add(id, Faction, { id: "player" });
    // hired companions copy this id; a trip transfers every member with it
    entities.add(id, Squad, { id: uuid() });
    entities.add(id, Health, { hp: 10 });
    entities.add(id, Mortal, { kind: "respawn" });
    // ~3 s from full, ~4.5 s back
    entities.add(id, Stamina, {
      value: 100,
      exhausted: false,
      drain: 34,
      regen: 22,
      recover: 0.3,
    });
    entities.add(id, Attributes, StatModel.defaults());
    entities.add(id, Stats, {
      // seeds only: the recompute below overwrites them from the attributes
      maxHp: 10,
      maxStamina: 100,
      attack: 1,
      defense: 0,
      speed: opts.speed,
    });
    entities.add(id, Inventory, { capacity: 16, maxWeight: 50 });
    entities.add(id, Encumbrance, {});
    const needs = Need.all();
    for (let i = 0; i < needs.length; i++)
      entities.add(id, needs[i].id, Object.assign({}, needs[i].seed));
    entities.add(id, Equipment, {});
    entities.add(id, Hotbar, {});
    entities.add(id, Favorites, {});
    // xscale carries both the facing flip and the baked size, so a flip preserves |xscale|.
    // The body art is a white template, so the skin is a tint over its body slots.
    entities.add(id, Sprite, {
      sprite: spineHuman,
      anim: Doll.rest(spineHuman),
      xscale: AssetMeta.fit(spineHuman, k),
      yscale: AssetMeta.fit(spineHuman, k),
      tints: ColonySpawn.skinTints(ColonyPlayer.SKIN),
    });
    entities.add(id, Appearance, {});
    // marks the input-driven entity; flat scalars so its state rides the map transfer
    entities.add(id, Playable, { cursorX: spawn.x, cursorY: spawn.y });
    // the lantern, revealing night
    entities.add(id, Light, {
      radius: 180,
      color: make_colour_rgb(255, 226, 168),
      intensity: 0.85,
    });
    // the camera's target marker, resolved live so no stored id dangles across a map transfer
    entities.add(id, CameraFocus, {});
    StatModel.recompute(entities, id);
    return id;
  },

  /**
   * The world point the player is pointing at. Under the pitched camera the cursor covers a
   * body's standing silhouette while the sim tests its ground footprint, so the silhouette picks
   * which body and the footprint says where. Over no body it answers the aim plane. Both reads
   * take the cursor off `view`, so they cannot disagree.
   */
  aim(entities, shooterId, view) {
    const pitch = view.pitch;
    const cursor = view.cursorWorld(); // the ground cursor; silhouette height is measured off it
    // Health is the shootable set: a corpse has none, so it never swallows the aim off a live
    // body standing over it
    const target = Silhouette.pick(entities, cursor, pitch, {
      has: Health,
      ignore: shooterId,
    });
    if (target !== -1) {
      const box = entities.get(target, BBox);
      if (box !== undefined) {
        const pos = entities.require(target, Position);
        return {
          x: pos.x + box.x + box.width * 0.5,
          y: pos.y + box.y + box.height * 0.5,
        };
      }
    }
    return view.cursorWorld(-AIM_H * RenderBillboard.tall(pitch));
  },

  /**
   * Instant hitscan shot, drawn as a fading tracer. `opts.pierce` counts hostiles passed through;
   * `opts.penetration` lowers target defense; `opts.nx/ny` is a caller-resolved aim, else the
   * pointer. Returns the normalized aim { nx, ny }.
   */
  fireBullet(level, shooterId, opts) {
    const entities = level.entities;
    const pos = entities.get(shooterId, Position);
    const muzzleY = pos.y + (opts.muzzleY ?? 0);
    let nx;
    let ny;
    if (opts.nx !== undefined && opts.ny !== undefined) {
      const m = Math.sqrt(opts.nx * opts.nx + opts.ny * opts.ny) || 1;
      nx = opts.nx / m;
      ny = opts.ny / m;
    } else {
      // flat-camera fallback only: the room pointer is wrong under the pitched camera, so
      // callers there must pass a resolved aim
      const dx = Input.pointer.roomX - pos.x;
      const dy = Input.pointer.roomY - muzzleY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = dx / dist;
      ny = dy / dist;
    }
    const range = opts.range ?? 920; // px
    const shot = Combat.hitscan(
      level,
      pos.x,
      muzzleY,
      pos.x + nx * range,
      muzzleY + ny * range,
      {
        owner: shooterId,
        damage: opts.damage,
        penetration: opts.penetration ?? 0,
        pierce: opts.pierce ?? 1,
      },
    );
    WorldOverlay
.pushTracer(pos.x, muzzleY, shot.x, shot.y);
    return { nx, ny };
  },
};

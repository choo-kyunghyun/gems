// Entity construction for the RPG levels — the "build the entities from spawn descriptors" half
// of the old RpgLevel, split out so level/grid building (RpgLevel.build/buildChunked) and entity
// building live in separate files. spawnEntity is the SINGLE place an entity is constructed:
// up-front map spawns (RpgSpawn.spawn) and the chunk streamer (ChunkSource.spawn) both route
// through it, so adding a preset touches one switch. Pure factory functions over `world`/`level`;
// no state of its own.
//
// Presets (grid coords gx/gy; sprites + box sizes are archetype, kept in code):
//   human    hp? loot:[{itemId,qty}]   (hostile human "Bandit" — the mobile melee enemy)
//   npc      label nameKey questId
//   chest    capacity items:[{itemId,qty}]
//   prop     label color(#hex) material? kind?   (material id w/ Material → tint, overrides color; kind → Station, else furniture)
//   torch    label? color(#hex)?        (decorative light prop — small solid post; carries a Light)
//   turret   label? color(#hex)?        (auto-firing defense — immovable Health + Faction "player" actor; stationary ranged CombatAI)
//   reach    half?                      (quest zone marker — no entity)
//   portal   toMap toEntry? label? color(#hex)?  (walk-onto door → RpgMap.go; non-solid sensor)
//   follower label? color(#hex)? speed? range?   (companion; starts in "follow" state)
globalThis.RpgSpawn = {
  /**
   * Spawn the level's entity instances (enemies, NPC, chest, props) from data.spawns. Slimes
   * acquire their target live by faction (FactionSystem.nearestHostile), so this no longer needs
   * the player id. Stations (chest/props) are discovered live by Interactable, so only the
   * handles the scene's own logic needs are returned:
   *   { enemies: id[], npc: id, reach: {x1,y1,x2,y2}|undefined,
   *     portals: [{ id, toMap, toEntry }], followers: id[] }
   */
  spawn(world, level, data, reconcile) {
    const spawns = data.spawns ?? [];
    const enemies = [];
    const portals = [];
    const followers = [];
    let npc = -1;
    let reach;

    // File-scope reconcile: a spawn with an `id` is a UNIQUE entity. `reconcile.gone` is the
    // current map's set of uids removed during play (killed/recruited) — skip those so they
    // don't re-spawn. id-less spawns are anonymous and always (re)spawn. Entities that ARE
    // spawned get a Persistent{uid} tag so the scene can remember their fate (see _markGone).
    const gone = (reconcile && reconcile.gone) || {};

    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      if (s.id !== undefined && gone[s.id]) continue; // removed this map — don't re-spawn
      if (s.preset === "reach") {
        reach = RpgSpawn.reachZone(level, s); // a region, not an entity
        continue;
      }
      const id = RpgSpawn.spawnEntity(world, level, s);
      if (id === -1) continue;
      // Classify the constructed entity into the scene's typed handles by its preset.
      if (s.preset === "human") enemies.push(id);
      else if (s.preset === "npc") npc = id;
      else if (s.preset === "portal")
        portals.push({ id, toMap: s.toMap, toEntry: s.toEntry ?? "default" });
      else if (s.preset === "follower") followers.push(id);
    }

    return { enemies, npc, reach, portals, followers };
  },

  // Reach-quest zone rect (world coords) for a "reach" spawn — no entity, just a region the
  // scene tests the player against.
  reachZone(level, s) {
    const w = level.gridToWorld(s.gx, s.gy);
    const half = s.half ?? 44;
    return { x1: w.x - half, y1: w.y - half, x2: w.x + half, y2: w.y + half };
  },

  // Construct ONE spawn descriptor's entity and return its id (-1 for non-entity presets like
  // "reach"). The single place entity construction lives, so the chunk streamer
  // (ChunkSource.spawn) builds entities through the same code. `gx/gy` are grid coords
  // (absolute; gridToWorld handles negatives, so chunk-streamed entities work too).
  spawnEntity(world, level, s) {
    const w = level.gridToWorld(s.gx, s.gy);

    if (s.preset === "human") {
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, { x: -12, y: -12, width: 24, height: 24 });
      // Dynamic (non-kinematic) so SolidSystem integrates the velocity CombatAI sets
      // and collides it against the kinematic walls.
      world.add(id, Collision, {
        solid: true,
        kinematic: false,
        mask: null,
        hits: [],
      });
      world.add(id, Health, { hp: s.hp ?? 3 });
      // Stat sheet — a bandit's damage + toughness are Stats-driven like every combatant now (attack
      // was the old Brain.damage). maxHp mirrors hp; stamina is vestigial for a monster.
      world.add(id, Stats, {
        maxHp: s.hp ?? 3,
        maxStamina: 0,
        attack: 1,
        defense: 0,
        speed: 90,
      });
      world.add(id, Mortal, { kind: "despawn" }); // hp 0 → spill loot + remove (RpgScene)
      world.add(id, Tag, { tags: new Set(["enemy", "human"]) });
      world.add(id, Faction, { id: "monster" }); // hostile to "player" → CombatAI aggro target
      world.add(id, Name, { name: "Bandit" });
      // Loot table — no maxWeight (loot is authored, never weight-gated).
      world.add(id, Inventory, { slots: s.loot ?? [], capacity: 8 });
      // Hostile human: the run sprite tinted toward red so it reads as an enemy at a glance,
      // animated so it looks alive (a temporary skin until dedicated enemy art lands).
      const vis = RpgSpawn._visual(spr_humanRun, make_colour_rgb(220, 130, 130), 2);
      vis.speed = 6;
      world.add(id, Visual, vis);
      CombatAI.attach(world, id, level); // adds Velocity + Brain + State (acquires target by faction)
      if (s.id !== undefined) world.add(id, Persistent, { uid: s.id }); // unique → reconcile
      return id;
    } else if (s.preset === "npc") {
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, { x: -14, y: -14, width: 28, height: 28 });
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Tag, { tags: new Set(["npc"]) });
      world.add(id, Name, { name: s.label });
      world.add(id, NPC, { name: s.nameKey, lines: [], questId: s.questId });
      // Friendly human (the village elder): the run sprite, untinted, standing still (no anim speed).
      world.add(id, Visual, RpgSpawn._visual(spr_humanRun, c_white, 2));
      if (s.id !== undefined) world.add(id, Persistent, { uid: s.id }); // unique → reconcile
      return id;
    } else if (s.preset === "chest") {
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, { x: -14, y: -14, width: 28, height: 28 });
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Station, { kind: "storage" });
      world.add(id, Name, { name: "Chest" });
      world.add(id, Inventory, {
        slots: s.items ?? [],
        capacity: s.capacity ?? 12,
      });
      world.add(id, Visual, RpgSpawn._visual(spr_chestClosed, c_white, 2));
      return id;
    } else if (s.preset === "prop") {
      // Solid kinematic prop. A Station `kind` makes it interactable (Interactable
      // picks it by mouse/proximity, E opens its window); a decorative prop omits it.
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, { x: -14, y: -14, width: 28, height: 28 });
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Name, { name: s.label });
      // Stations with dedicated art use it; a generic furniture prop falls back to a tinted box
      // (spr_square, scaled to the bbox) until it has its own sprite.
      let pvis;
      if (s.kind === "workbench") pvis = RpgSpawn._visual(spr_workbench, c_white, 2);
      else if (s.kind === "claim") pvis = RpgSpawn._visual(spr_marker, c_white, 2);
      else pvis = RpgSpawn._visual(spr_square, RpgSpawn._tint(s), 1.75);
      world.add(id, Visual, pvis);
      if (s.kind !== undefined) world.add(id, Station, { kind: s.kind });
      else world.add(id, Tag, { tags: new Set(["furniture"]) });
      return id;
    } else if (s.preset === "torch") {
      // A decorative LIGHT prop: a small solid post carrying a Light component, drawn by the
      // RenderLighting pass. Persists/deconstructs like any built entity — EntitySnapshot copies
      // every component, so the Light round-trips through a map reload with no special handling.
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 }); // small footprint
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Name, { name: s.label ?? "Torch" });
      world.add(
        id,
        Visual,
        RpgSpawn._visual(spr_square, RpgSpawn._tint(s, "#ff9a3c"), 1), // small post box (no torch art yet)
      );
      // Warm, gently flickering torch light (archetype values; tune via the Light component).
      world.add(id, Light, {
        radius: 150,
        color: Color.parse("#ffd09a"),
        intensity: 0.9,
        flicker: 0.18,
      });
      world.add(id, Tag, { tags: new Set(["furniture"]) });
      return id;
    } else if (s.preset === "turret") {
      // Auto-firing defense post: an immovable, player-faction ACTOR — a stationary ranged
      // CombatAI (mobile:false, ranged:true), no dedicated component. It carries Health + the
      // player faction (so slimes target & damage it — two-sided combat); CombatAI reads its Brain
      // to shoot the nearest hostile. Built-only today (BuildMode "Defense"); all components
      // round-trip through map persistence like any built entity.
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, { x: -12, y: -12, width: 24, height: 24 });
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      world.add(id, Health, { hp: 8 });
      // Stat sheet — the turret's shot damage is Stats.attack now (was the Turret/Brain damage).
      world.add(id, Stats, {
        maxHp: 8,
        maxStamina: 0,
        attack: 2,
        defense: 0,
        speed: 0,
      });
      world.add(id, Faction, { id: "player" }); // ally of the player; a hostile target for slimes
      world.add(id, Name, { name: s.label ?? "Turret" });
      world.add(
        id,
        Visual,
        RpgSpawn._visual(spr_square, RpgSpawn._tint(s, "#6c7a89"), 1.5), // box (no turret art yet)
      );
      world.add(id, Tag, { tags: new Set(["turret"]) });
      // Stationary ranged brain: aggro == fire range, so it acquires the nearest hostile in range
      // and fires the shared "bullet" through ProjectileSystem (see CombatAI._fireAt). No dedicated
      // Turret component — a turret is just an immovable, player-faction CombatAI actor.
      CombatAI.attach(world, id, level, {
        mobile: false,
        ranged: true,
        aggro: 220,
        deAggro: 220,
        attackRange: 220,
        cdMax: 30,
        bulletSpeed: 380,
        speed: 0,
      });
      return id;
    } else if (s.preset === "portal") {
      // A doorway: a non-solid sensor entity the player walks onto to travel to another
      // map. Visible (Visual box + Name) and minimap-tagged. The destination rides on the
      // entity (Portal component) so a streamed portal resolves via a live Tag "portal" query.
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, { x: -14, y: -14, width: 28, height: 28 });
      world.add(id, Tag, { tags: new Set(["portal"]) });
      world.add(id, Name, { name: s.label ?? "Door" });
      world.add(id, Visual, RpgSpawn._visual(spr_portal, c_white, 2));
      world.add(id, Portal, {
        toMap: s.toMap,
        toEntry: s.toEntry ?? "default",
      });
      return id;
    } else if (s.preset === "follower") {
      return RpgSpawn.spawnFollower(world, w.x, w.y, {
        label: s.label,
        color: s.color,
        speed: s.speed,
        range: s.range,
      });
    }
    return -1;
  },

  // Spawn a companion (a dynamic solid body — SolidSystem integrates the velocity
  // FollowerSystem sets and collides it against walls) at world coords; returns the id.
  // Shared by the `follower` spawn preset and the scene's programmatic starting-party seed.
  // NOTE: a companion is a *persistent* entity (it travels/stations via EntitySnapshot), so
  // prefer the programmatic seed over authoring one in a PERSISTENT map's file — a file spawn
  // re-runs on every revisit and would duplicate the restored party/stationed copy (the
  // file-scope reconcile problem, deferred). The preset is fine for non-persistent maps.
  spawnFollower(world, wx, wy, opt = {}) {
    const id = world.create();
    world.add(id, Position, { x: wx, y: wy, z: 0 });
    world.add(id, Velocity, { x: 0, y: 0, z: 0 });
    world.add(id, BBox, { x: -10, y: -10, width: 20, height: 20 });
    world.add(id, Collision, {
      solid: true,
      kinematic: false,
      mask: null,
      hits: [],
    });
    world.add(id, Tag, { tags: new Set(["follower"]) });
    world.add(id, Faction, { id: "player" }); // party ally — friendly fire skips it; slimes DO aggro it (it has Health)
    // A companion is mortal but recoverable: at 0 hp it goes Down (Health detached, dimmed) and,
    // after Mortal.recoverSecs, revives at the recovery spot (claimed build zone / spawn) — see
    // RpgScene.resolveHealth/_goDown/updateDowned. Not removed like an enemy.
    world.add(id, Health, { hp: opt.hp ?? 6 });
    // Stat sheet — a companion is a combatant (slimes attack it; it may fight later), so it carries
    // defense (mitigation) + an attack stat like every other actor.
    world.add(id, Stats, {
      maxHp: opt.hp ?? 6,
      maxStamina: 0,
      attack: 1,
      defense: 0,
      speed: opt.speed ?? 260,
    });
    world.add(id, Mortal, {
      kind: "down",
      recoverSecs: opt.recoverSecs ?? 6,
      reviveHp: opt.hp ?? 6,
    });
    world.add(id, Name, { name: opt.label ?? "Companion" });
    // Friendly human companion: the run sprite tinted toward green so it reads as an ally.
    world.add(
      id,
      Visual,
      RpgSpawn._visual(spr_humanRun, Color.parse(opt.color ?? "#9fe0c0"), 2),
    );
    world.add(id, Follower, {
      state: opt.state ?? "follow",
      speed: opt.speed ?? 260, // > player speed (220) so it can catch up when it lags
      range: opt.range ?? 40,
      homeMap: "",
      // Carry bonus applied to the player's Inventory while this companion follows (0 = none).
      // The `follower` spawn preset doesn't pass these, so file-authored followers stay
      // benefit-free; only the scene's programmatic party seed grants a bonus.
      bonusCapacity: opt.bonusCapacity ?? 0,
      bonusWeight: opt.bonusWeight ?? 0,
    });
    return id;
  },

  // Resolve a spawn descriptor's tint: a `material` id whose Item carries a Material component
  // wins (RimWorld-style per-material tinting — one source of truth, so "wooden things look like
  // wood" comes from the wood item, not a hex copied per furniture), else the explicit `color`
  // (#hex), else `fallback`, else white. Material.color is pre-parsed in its constructor, so this
  // returns a colour int either way. Item is registered at scene create() (RpgContent), well
  // before any spawn, so the lookup is always populated.
  _tint(s, fallback) {
    if (s.material !== undefined) {
      const item = Item.get(s.material);
      const mat = item !== undefined ? item.getComponent(Material) : undefined;
      if (mat !== undefined) return mat.color;
    }
    const hex = s.color ?? fallback;
    return hex !== undefined ? Color.parse(hex) : c_white;
  },

  // Shared Visual component shape — caller passes a `scale` (the 16px source art is drawn at the
  // 32px world pixel scale, so entity sprites pass 2; a box-fallback sprite scales to its bbox).
  // Sprites are centered (origin 8,8) so this draws on the entity's Position. Caller may set
  // `speed` after for a looping idle/run cycle.
  _visual(sprite, color, scale = 1) {
    return {
      visible: true,
      sprite: sprite,
      subimg: 0,
      xscale: scale,
      yscale: scale,
      rot: 0,
      color: color,
      alpha: 1,
      speed: 0,
      time: 0,
    };
  },
};

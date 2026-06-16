// Entity construction for the RPG levels — the "build the entities from spawn descriptors" half
// of the old RpgLevel, split out so level/grid building (RpgLevel.build/buildChunked) and entity
// building live in separate files. spawnEntity is the SINGLE place an entity is constructed:
// up-front map spawns (RpgSpawn.spawn) and the chunk streamer (ChunkSource.spawn) both route
// through it, so adding a preset touches one switch. Pure factory functions over `world`/`level`;
// no state of its own.
//
// Presets (grid coords gx/gy; sprites + box sizes are archetype, kept in code):
//   slime    hp? loot:[{itemId,qty}]
//   npc      label nameKey questId
//   chest    capacity items:[{itemId,qty}]
//   prop     label color(#hex) kind?   (kind → Station, else decorative furniture)
//   torch    label? color(#hex)?        (decorative light prop — small solid post; carries a Light)
//   turret   label? color(#hex)?        (auto-firing defense — solid post; Health + Faction "player" + Turret)
//   reach    half?                      (quest zone marker — no entity)
//   portal   toMap toEntry? label? color(#hex)?  (walk-onto door → RpgMap.load; non-solid sensor)
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
      if (s.preset === "slime") enemies.push(id);
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

    if (s.preset === "slime") {
      const id = world.create();
      world.add(id, Position, { x: w.x, y: w.y, z: 0 });
      world.add(id, BBox, { x: -12, y: -12, width: 24, height: 24 });
      // Dynamic (non-kinematic) so SolidSystem integrates the velocity SlimeAI sets
      // and collides it against the kinematic walls.
      world.add(id, Collision, {
        solid: true,
        kinematic: false,
        mask: null,
        hits: [],
      });
      world.add(id, Health, { hp: s.hp ?? 3 });
      world.add(id, Tag, { tags: new Set(["enemy", "slime"]) });
      world.add(id, Faction, { id: "monster" }); // hostile to "player" → SlimeAI aggro target
      world.add(id, Name, { name: "Slime" });
      // Loot table — no maxWeight (loot is authored, never weight-gated).
      world.add(id, Inventory, { slots: s.loot ?? [], capacity: 8 });
      world.add(
        id,
        Visual,
        RpgSpawn._visual(spr_choo, make_colour_rgb(120, 220, 130)),
      );
      SlimeAI.attach(world, id, level); // adds Velocity + Brain + State (acquires target by faction)
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
      const vis = RpgSpawn._visual(spr_hana, c_white);
      vis.xscale = 0.6;
      vis.yscale = 0.6;
      world.add(id, Visual, vis);
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
      world.add(id, Visual, RpgSpawn._visual(spr_choo, Color.parse("#c8a046")));
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
      world.add(id, Visual, RpgSpawn._visual(spr_choo, Color.parse(s.color)));
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
        RpgSpawn._visual(spr_choo, Color.parse(s.color ?? "#ff9a3c")),
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
      // Auto-firing defense post. A solid kinematic structure that carries Health + the player
      // faction (so slimes target & damage it — two-sided combat) and a Turret profile that
      // TurretSystem reads to shoot the nearest hostile. Built-only today (BuildMode "Defense");
      // all components round-trip through map persistence like any built entity.
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
      world.add(id, Faction, { id: "player" }); // ally of the player; a hostile target for slimes
      world.add(id, Turret, {
        range: 220,
        fireCd: 30,
        cd: 0,
        damage: 2,
        bulletSpeed: 380,
      });
      world.add(id, Name, { name: s.label ?? "Turret" });
      world.add(
        id,
        Visual,
        RpgSpawn._visual(spr_choo, Color.parse(s.color ?? "#6c7a89")),
      );
      world.add(id, Tag, { tags: new Set(["turret"]) });
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
      world.add(
        id,
        Visual,
        RpgSpawn._visual(spr_choo, Color.parse(s.color ?? "#7c6fd0")),
      );
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
    world.add(id, Faction, { id: "player" }); // party ally — combat skips it; slimes won't aggro (no Health)
    world.add(id, Name, { name: opt.label ?? "Companion" });
    world.add(
      id,
      Visual,
      RpgSpawn._visual(spr_choo, Color.parse(opt.color ?? "#6fd0a0")),
    );
    world.add(id, Follower, {
      state: opt.state ?? "follow",
      speed: opt.speed ?? 260, // > player speed (220) so it can catch up when it lags
      range: opt.range ?? 40,
      homeMap: "",
    });
    return id;
  },

  // Shared Visual component shape — caller overrides scale/sprite/color as needed.
  _visual(sprite, color) {
    return {
      visible: true,
      sprite: sprite,
      subimg: 0,
      xscale: 1,
      yscale: 1,
      rot: 0,
      color: color,
      alpha: 1,
      speed: 0,
      time: 0,
    };
  },
};

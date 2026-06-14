// Level builder for the top-down demo. Reads level data produced by
// LevelSerializer.load (genre "topdown"); add more level files to extend the game.
//
// build() creates and returns { level, spawn, wallLayer, floorLayer, wallType,
// floorType, colliders } — the scene owns level's lifecycle. The wall TileLayer is
// kept on the level (not discarded) so a debug render pass can draw it and build mode
// can edit it; colliders are greedy-meshed from that layer by the Core TileEdit service
// (TileEdit.meshSolid here, TileEdit.remesh after build-mode edits).
//
// Level data: { cell?, cols, rows, meta: { playerSpawn: { gx, gy } },
//   walls: [[x, y, w, h], ...] } — walls are authored as cell rectangles (compact +
// hand-authorable, and they map straight onto the greedy mesh below). Grid size comes
// from cols/rows, NOT the room, so a level can exceed the view and the follow camera
// scrolls across it.

const RPG_CELL = 32; // fallback cell size when a level omits `cell`

globalThis.RpgLevel = {
  // World graph: map id -> level file. The overworld hub, sub-levels (interiors/dungeons),
  // and side-islands are all just map files connected by `portal` spawns (see spawn() below).
  // This is the seed registry — extract to a `maps.json` manifest later if it grows. START is
  // the map a normal lobby launch boots into; sceneRpg.loadMap(id, entry) resolves files here.
  MAPS: {
    overworld: "levels/overworld.json",
    interior_01: "levels/interior_01.json",
  },
  START: "overworld",
  mapFile(id) {
    return RpgLevel.MAPS[id];
  },

  // Set by the level editor's Test Play to a save-dir level file; sceneRpg consumes it
  // once on create (then clears it, falling back to the bundled level). Not gameplay state —
  // a one-shot hand-off channel between the editor and the play scene.
  playtestFile: undefined,

  /**
   * Creates a Level from data, paints walls into a persistent TileLayer, and spawns
   * kinematic wall colliders into world. Returns the level handles; the caller owns
   * level.destroy() and the collider entities.
   *
   * `entryId` selects where the player spawns from `meta.entries` (a named-point map, e.g.
   * "default" or "from_interior" — the matching side of a portal). Falls back to
   * entries.default, then to the legacy `meta.playerSpawn`, so older single-entry files
   * still build unchanged.
   */
  build(world, data, entryId = "default") {
    const cell = data.cell ?? RPG_CELL;
    const level = new Level({
      cellWidth: cell,
      cellHeight: cell,
      cols: data.cols,
      rows: data.rows,
    });
    const wallType = new TileType({ id: 1, name: "벽", pathCost: null });
    const floorType = new TileType({ id: 2, name: "바닥" }); // walkable cosmetic (pathCost 1)

    // Bottom floor layer (walkable, nav-neutral) then the wall layer above it. Both stay
    // on the level so Level._computeNav resolves wall→Infinity else floor/empty→1 and the
    // debug pass can read them. Floors are placed at runtime by build mode, so the file
    // paints only walls.
    const floorLayer = new TileLayer(level.cols, level.rows, { emptyCost: 1 });
    const wallLayer = new TileLayer(level.cols, level.rows);
    level.insert(floorLayer);
    level.insert(wallLayer);

    const rects = data.walls ?? [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const x0 = r[0];
      const y0 = r[1];
      for (let y = y0; y < y0 + r[3]; y++)
        for (let x = x0; x < x0 + r[2]; x++) wallLayer.set(x, y, wallType);
    }
    // Optional floor rects (walkable cosmetic, no collider) — same [x,y,w,h] shape as
    // walls; absent in older level files, so the game is unaffected when omitted.
    const frects = data.floors ?? [];
    for (let i = 0; i < frects.length; i++) {
      const r = frects[i];
      const x0 = r[0];
      const y0 = r[1];
      for (let y = y0; y < y0 + r[3]; y++)
        for (let x = x0; x < x0 + r[2]; x++) floorLayer.set(x, y, floorType);
    }
    level.syncAll();

    const colliders = [];
    TileEdit.meshSolid(world, level, wallLayer, colliders);

    // Resolve the spawn point: named entry → entries.default → legacy playerSpawn.
    const entries = data.meta.entries;
    let entry = data.meta.playerSpawn;
    if (entries !== undefined)
      entry = entries[entryId] ?? entries.default ?? entry;
    const spawn = level.gridToWorld(entry.gx, entry.gy);
    return {
      level,
      spawn,
      wallLayer,
      floorLayer,
      wallType,
      floorType,
      colliders,
    };
  },

  /**
   * Spawn the level's entity instances (enemies, NPC, chest, props) from data.spawns,
   * called AFTER the player controller exists (slimes need the player id for their AI).
   * Stations (chest/props) are discovered live by Interactable, so only the handles the
   * scene's own logic needs are returned:
   *   { enemies: id[], npc: id, reach: {x1,y1,x2,y2}|undefined,
   *     portals: [{ id, toMap, toEntry }], followers: id[] }
   *
   * Presets (grid coords gx/gy; sprites + box sizes are archetype, kept in code):
   *   slime    hp? loot:[{itemId,qty}]
   *   npc      label nameKey questId
   *   chest    capacity items:[{itemId,qty}]
   *   prop     label color(#hex) kind?   (kind → Station, else decorative furniture)
   *   reach    half?                      (quest zone marker — no entity)
   *   portal   toMap toEntry? label? color(#hex)?  (walk-onto door → loadMap; non-solid sensor)
   *   follower label? color(#hex)? speed? range?   (companion; starts in "follow" state)
   */
  spawn(world, level, data, playerId, reconcile) {
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
        world.add(id, Name, { name: "Slime" });
        // Loot table — no maxWeight (loot is authored, never weight-gated).
        world.add(id, Inventory, { slots: s.loot ?? [], capacity: 8 });
        world.add(
          id,
          Visual,
          this._visual(spr_choo, make_colour_rgb(120, 220, 130)),
        );
        SlimeAI.attach(world, id, playerId); // adds Velocity + Brain + State
        if (s.id !== undefined) world.add(id, Persistent, { uid: s.id }); // unique → reconcile
        enemies.push(id);
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
        const vis = this._visual(spr_hana, c_white);
        vis.xscale = 0.6;
        vis.yscale = 0.6;
        world.add(id, Visual, vis);
        if (s.id !== undefined) world.add(id, Persistent, { uid: s.id }); // unique → reconcile
        npc = id;
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
        world.add(id, Visual, this._visual(spr_choo, Color.parse("#c8a046")));
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
        world.add(id, Visual, this._visual(spr_choo, Color.parse(s.color)));
        if (s.kind !== undefined) world.add(id, Station, { kind: s.kind });
        else world.add(id, Tag, { tags: new Set(["furniture"]) });
      } else if (s.preset === "reach") {
        const half = s.half ?? 44;
        reach = {
          x1: w.x - half,
          y1: w.y - half,
          x2: w.x + half,
          y2: w.y + half,
        };
      } else if (s.preset === "portal") {
        // A doorway: a non-solid sensor entity the player walks onto to travel to another
        // map. Visible (Visual box + Name) and minimap-tagged; the destination is read from
        // the parallel `portals` array (keyed by id) when the scene resolves the overlap.
        const id = world.create();
        world.add(id, Position, { x: w.x, y: w.y, z: 0 });
        world.add(id, BBox, { x: -14, y: -14, width: 28, height: 28 });
        world.add(id, Tag, { tags: new Set(["portal"]) });
        world.add(id, Name, { name: s.label ?? "Door" });
        world.add(
          id,
          Visual,
          this._visual(spr_choo, Color.parse(s.color ?? "#7c6fd0")),
        );
        portals.push({
          id,
          toMap: s.toMap,
          toEntry: s.toEntry ?? "default",
        });
      } else if (s.preset === "follower") {
        followers.push(
          this.spawnFollower(world, w.x, w.y, {
            label: s.label,
            color: s.color,
            speed: s.speed,
            range: s.range,
          }),
        );
      }
    }

    return { enemies, npc, reach, portals, followers };
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
    world.add(id, Name, { name: opt.label ?? "Companion" });
    world.add(
      id,
      Visual,
      this._visual(spr_choo, Color.parse(opt.color ?? "#6fd0a0")),
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

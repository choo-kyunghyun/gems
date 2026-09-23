/**
 * The colony's presentation over a mounted level.
 *
 * Everything here is a READ of the level — its grid, its layer handles and material table, its
 * whole-map records (indoor, biome, wind) — and a write into `ColonyMap.runtime(level)`; nothing
 * of a map lives here. The camera is an ENTITY of the level's store (Cameras.create) under the
 * follow policy, and every view-dependent pass takes its view record at construction, which is
 * why `activate` builds the camera first. The atmosphere constants (BB_PITCH, PITCH_CURVE,
 * chroma) are this engine's tuning — the pitched 2.5D framing every pass and the camera agree on.
 */
globalThis.ColonyView = {
  // 2.5D adopted: camera pitch in degrees (0 = flat top-down, debug only — front-view art reads
  // wrong flat). Read by _renderer (billboard vs flat entity pass) + _camera (pitch + framing
  // zoom). With the upright-sprite camera this is the frame-0 seed + the pitched-map GATE only —
  // the LIVE pitch is PITCH_CURVE below (42° zoomed out → 58° zoomed in).
  BB_PITCH: 42,
  // Pitch-by-zoom curve (upright-sprite camera), the CameraFollow curve fields: shallow 42° at
  // the zoom-out floor (~1.25 on a 1920 surface) easing linearly to 58° at max zoom-in (2.625) —
  // "look further = flatter". Thresholds are the spike values HALVED for the 32px-cell world
  // (zoom seeds halved, same screen framing); the 42–58° outputs are angles, unchanged.
  PITCH_CURVE: { pitchLo: 42, pitchHi: 58, zoomLo: 1.25, zoomHi: 2.625 },

  /**
   * The world's albedo chroma this frame (shMeshlit's u_chroma, through RenderMesh's provider):
   * the clock's hour/season schedule times the sky's factor, pulled toward 1 (the authored
   * colours) by the `worldChroma` setting — 0 turns the atmosphere off, 1 is the full schedule.
   */
  chroma() {
    const k = WorldClock.chroma() * Weather.chromaMod();
    return 1 - (1 - k) * Settings.get("worldChroma");
  },

  /**
   * The presentation over a mounted level — once per level, on its first activation: the follow
   * camera, then the pass stack (which takes the camera's view at construction).
   */
  activate(level) {
    ColonyView._camera(level);
    ColonyView._renderer(level);
  },

  /**
   * RenderGrass clump defs for a material table: per material, its MATERIALS clump (one row,
   * the profile's `clumpTint` overriding its own) plus its clutter rows, plus the profile's
   * `clutter` extras for that material — each a { id (the TileType threshold), sprite, min, max,
   * chance, scaleMin, scaleMax, tint, edge, flat } row the pass scatters.
   */
  _clumpDefs(mats, profile) {
    const tintHex = profile !== undefined ? profile.clumpTint : undefined;
    const extra = profile !== undefined ? profile.clutter : undefined;
    const defs = [];
    for (let i = 0; i < mats.length; i++) {
      const mat = mats[i].material;
      const def = mat !== undefined ? contentBiomes.MATERIALS[mat] : undefined;
      if (def === undefined) continue;
      const rows = [];
      if (def.clump !== undefined)
        rows.push({
          src: def.clump,
          tint: tintHex !== undefined ? tintHex : def.clump.tint,
        });
      if (def.clutter !== undefined)
        for (let k = 0; k < def.clutter.length; k++)
          rows.push({ src: def.clutter[k], tint: def.clutter[k].tint });
      const own = extra !== undefined ? extra[mat] : undefined;
      if (own !== undefined)
        for (let k = 0; k < own.length; k++)
          rows.push({ src: own[k], tint: own[k].tint });
      for (let k = 0; k < rows.length; k++) {
        const src = rows[k].src;
        defs.push({
          id: mats[i].type.id,
          sprite: src.sprite,
          min: src.min,
          max: src.max,
          chance: src.chance,
          scaleMin: src.scaleMin,
          scaleMax: src.scaleMax,
          tint: rows[k].tint !== undefined ? Color.parse(rows[k].tint) : undefined,
          edge: src.edge,
          flat: src.flat,
        });
      }
    }
    return defs;
  },

  /**
   * A terrain pass's `wave` option for a contentBiomes material id: its crest tone as 0..1
   * floats over the weather's sim clock (the crests freeze on pause with the rain), or
   * undefined for still ground (and for a saved row predating material ids).
   */
  _wave(materialId) {
    const def =
      materialId !== undefined ? contentBiomes.MATERIALS[materialId] : undefined;
    if (def === undefined || def.wave === undefined) return undefined;
    const c = Color.parse(def.wave);
    return {
      r: colour_get_red(c) / 255,
      g: colour_get_green(c) / 255,
      b: colour_get_blue(c) / 255,
      time: () => Weather.time(),
    };
  },

  /**
   * Assemble the renderer pass stack (ground → tiles → shadows → entities → debug →
   * sky overlay → lighting).
   *
   * The GROUND is the terrain layer either way — the difference is only how many passes read it. A
   * generated map's biome materials stack as one dual-grid pass per material, lowest first, each
   * taking the cells whose TileType id reaches its threshold: an upper material's transparent
   * corners reveal the one below, which is the A-over-B transition the sets are drawn for. Because
   * the stack is cumulative, `skipAbove` drops the quads the next material covers whole — without it
   * every material would draw its full extent under the ones above.
   */
  _renderer(level) {
    const pitch = ColonyView.BB_PITCH;
    const rt = ColonyMap.runtime(level);
    const camera = CameraSystem.view(level); // the camera entity is built first (activate): every view-dependent pass takes its view here
    Grassland.clearBuilt(level); // prefab-built ground sheds its grass before the VBOs bake
    const renderer = new Renderer();
    rt.renderer = renderer;
    // Generated ground UNDER everything (the LAYERS loop below skips `terrain` when this ran).
    const mats = rt.terrainMats;
    if (mats !== undefined)
      for (let i = 0; i < mats.length; i++) {
        const spr = mats[i].sprite;
        if (!sprite_exists(spr)) {
          // a saved row whose art is gone since (ColonyLevel._terrainTypes)
          Log.warn(`terrain sprite missing: ${mats[i].material}`);
          continue;
        }
        const pass = new RenderTileMap(rt.terrainLayer, level.grid, spr, {
          autotile: "dual",
          minId: mats[i].type.id,
          skipAbove: i < mats.length - 1 ? mats[i + 1].type.id : undefined,
          wave: ColonyView._wave(mats[i].material),
        });
        rt.terrainPasses.push(pass);
        renderer.insert(pass);
      }
    // the grass materials' volume layer (RenderGrass) — upright clumps entering the depth
    // pool over the finished ground, before the entities; the camera's live pitch drives its
    // height compensation like the billboards'
    if (mats !== undefined) {
      const profile = contentBiomes.BIOMES[level.entities.get(level.self, ColonyMap.BIOME)];
      const cdefs = ColonyView._clumpDefs(mats, profile);
      if (cdefs.length > 0) {
        // wind: the meta constant; a save predating it falls back to the biome profile
        let wind = level.entities.get(level.self, ColonyMap.WIND);
        if (wind === undefined)
          wind = profile !== undefined && profile.wind !== undefined ? profile.wind : 0;
        rt.grassPass = new RenderGrass(rt.terrainLayer, level.grid, cdefs, {
          wind: wind,
          time: () => Weather.time(),
          camera: camera,
        });
        renderer.insert(rt.grassPass);
      }
    }
    // Resident tile layers (terrain/floor) as real tilemaps — bottom→top per contentTiles.LAYERS;
    // the wall layer draws only as the lit RenderWalls pass below (pitched maps — no flat
    // fallback); on pitched maps the fence layer joins as RenderFence (its flat fallback
    // keeps the autotile RenderTileMap). VBO-cached + keyed by layer
    // so a BuildMode edit markDirty's the matching pass. A generated map holds the floor/fence
    // layers EMPTY until the player builds — an empty layer emits no quads, so they are free there.
    const tilePasses = rt.tilePasses;
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (cfg.key === "wall") continue; // RenderWalls (lit boxes) below — no flat fallback
      if (cfg.key === "fence" && pitch > 0) continue; // RenderFence (post-and-rail boxes) below
      if (cfg.key === "terrain" && mats !== undefined) continue; // the material stack above
      const pass = new RenderTileMap(
        rt[cfg.key + "Layer"],
        level.grid,
        cfg.sprite,
        {
          autotile: cfg.type,
          color: Color.parse(cfg.color),
        },
      );
      tilePasses[cfg.key] = pass;
      renderer.insert(pass);
    }
    // the sprite-free cost fill stays as an inspection overlay, inserted off; culled to the
    // camera view like the grid lines (essential on a large generated map)
    const costPass = new RenderDebugTileMap(level.grid, {
      cost: true,
      tiles: false,
      alpha: 0.5,
      camera: camera,
    });
    costPass.enabled = false;
    renderer.insert(costPass);
    const gridPass = new RenderGrid(level.grid, { camera: camera }); // cell boundary lines
    gridPass.enabled = false; // off in normal play
    renderer.insert(gridPass);
    // Foot shadows UNDER the entities (runtime ellipse per body, not baked into the sprites).
    // A body lying FLAT casts none: a corpse (Interaction "corpse" — ColonyCombat._toCorpse; NPCs
    // carry no Health, so Health can't be the living test) or a downed companion (Downed).
    renderer.insert(
      new RenderEntityShadow({
        filter: (entities, id) => {
          if (entities.has(id, Downed)) return false;
          const it = entities.get(id, Interaction);
          return it !== undefined ? it.kind !== "corpse" : true; // `?:` not `||` (docs/GMRT.md)
        },
      }),
    );
    // Deep-furniture meshes (VOLUME category of the projection contract — see RenderBillboard):
    // real depth-writing geometry, so it shares the billboard depth pool. Pitched maps only —
    // a flat map has no depth-writing entity pass to sort against. Sun + point lights injected
    // like RenderLighting's ambient (the pass is Core; WorldClock and the Light token are not);
    // the camera is the nearest-point-light selection center. seed = entity id keeps the mesh
    // flicker in phase with RenderLighting's glow pools.
    let meshPass;
    if (pitch > 0) {
      meshPass = new RenderMesh({
        sun: () => WorldClock.sunDir(),
        chroma: () => ColonyView.chroma(), // the atmosphere dial (hour × season × sky × setting)
        pointLights: (entities) => {
          const out = [];
          entities.forEach([Light, Position], (id, lt, p) => {
            out.push({
              x: p.x,
              y: p.y,
              radius: lt.radius,
              color: lt.color,
              intensity: lt.intensity,
              flicker: lt.flicker,
              seed: id,
            });
          });
          return out;
        },
        camera: camera,
      });
      renderer.insert(meshPass);
      // GROUND joins the one lit shader: the terrain material stack + every resident tile pass
      // read this pass's light gather (up normal — flat ground). Assigned post-construction
      // because the ground passes are built above, before the mesh pass exists; the wall
      // passes below take it at construction. Flat maps (pitch 0) stay unlit.
      for (let i = 0; i < rt.terrainPasses.length; i++)
        rt.terrainPasses[i].lights = meshPass;
      if (rt.grassPass !== undefined) rt.grassPass.lights = meshPass;
      const tileKeys = Object.keys(tilePasses);
      for (let i = 0; i < tileKeys.length; i++)
        tilePasses[tileKeys[i]].lights = meshPass;
      // WALLS category (art projection contract): the resident wall layer as lit boxes
      // (top + exposed south faces) in the same depth pool, sharing the mesh pass's
      // sun + culled point lights. Keyed into tilePasses so BuildMode's edit
      // markDirty reaches it.
      // ONE pass covers every wall on the map — the generator's and the player's both paint the
      // same layer. PER-CELL MATERIALS from the wall cfg (near-white face texture × tint per
      // material, bucketed by TileType id — see RenderWalls); materials[0] (brick) doubles as the
      // default bucket for generated walls.
      const wallCfg = contentTiles.get("wall");
      const wallMats = [];
      for (let i = 0; i < wallCfg.materials.length; i++) {
        const m = wallCfg.materials[i];
        wallMats.push({
          id: m.id,
          sprite: m.sprite,
          frame: 0,
          color: Color.parse(m.color),
        });
      }
      tilePasses.wall = new RenderWalls(level.grid, rt.wallLayer, {
        color: wallMats[0].color,
        sprite: wallMats[0].sprite,
        frame: 0,
        lights: meshPass,
        materials: wallMats,
      });
      renderer.insert(tilePasses.wall);
      // the fence layer as lit post-and-rail boxes in the same depth pool — its occupancy read
      // is the autotiling (RenderFence); the flat blob4 config stays for the editor
      tilePasses.fence = new RenderFence(level.grid, rt.fenceLayer, {
        color: Color.parse(contentTiles.get("fence").color),
        lights: meshPass,
      });
      renderer.insert(tilePasses.fence);
    }
    // Entities via the production sprite pass (per-entity data — name/facing/animator state —
    // is inspected with entities.dump(), not by world-space label passes).
    // Pitched maps hand the billboard pass the mesh pass as its light source (sprite sun
    // response: sprites dim/warm with the sun + catch torchlight like the mesh faces) and the
    // camera, whose live pitch drives its height compensation (the STANDING category).
    renderer.insert(
      pitch > 0
        ? new RenderBillboard({ lights: meshPass, camera: camera })
        : new RenderEntity(),
    );
    // lime bbox outlines — the debugBBox setting is the toggle (sceneColony.draw syncs it live)
    rt.bboxPass = new RenderDebugEntity();
    rt.bboxPass.enabled = Settings.get("debugBBox");
    renderer.insert(rt.bboxPass);
    const paths = new RenderDebugPath(level.grid); // enemy A* paths, off until toggled
    paths.enabled = false;
    renderer.insert(paths);
    // entity "active range" rings (turret fire / enemy aggro/give-up/attack), off until toggled
    const ranges = new RenderDebugRange({
      ranges: [
        {
          component: Brain,
          field: "deAggro",
          color: make_colour_rgb(110, 110, 110),
          alpha: 0.3,
        },
        {
          component: Brain,
          field: "aggro",
          color: make_colour_rgb(230, 220, 80),
        },
        {
          component: Brain,
          field: "attackRange",
          color: make_colour_rgb(235, 80, 80),
        },
      ],
    });
    renderer.insert(ranges);
    // The sky overlay just under the day/night tint, so night darkens the rain: cloud shadows
    // under the weather (tint + rain/snow), both layers of one RenderOverlay that is cut out over
    // every room (Rooms.rects, the boxes a wall tall) — no rain, tint or cloud on a floor under a
    // roof. Skipped indoors (meta.indoor) — no open sky inside a cave.
    if (level.entities.get(level.self, ColonyMap.INDOOR) !== true) {
      const clouds = new RenderCloudShadow({ camera: camera });
      clouds.enabled = false; // the flat look: no noise field drifting over the ground
      const weather = new RenderWeather({ camera: camera });
      const wall = tilePasses.wall; // RenderWalls on a pitched map (its height); flat: absent
      const roofH =
        wall !== undefined && wall.height !== undefined ? wall.height : 0;
      const rooms = RoomSystem.rooms(level);
      renderer.insert(
        new RenderOverlay({
          layers: [clouds, weather],
          cutout: () => rooms.rects(),
          height: roofH,
          camera: camera,
        }),
      );
    }
    // Lighting LAST — a per-frame light map composited over everything. Day/night is its ambient
    // term ("lighting with no lights"); Light entities + a night vignette layer on top.
    renderer.insert(
      new RenderLighting({
        ambient: () => WorldClock.tint(),
        vignette: 0, // the flat look: night is one even multiply, no corner gradient
        camera: camera,
      }),
    );
  },

  /**
   * The level's camera entity under the follow policy; the passes take its view at construction
   * (_renderer). A restored save already holds the entity (the view it was left at), a
   * fresh build gets one at the spawn; the policy is minted either way — its tuning is this
   * engine's, not the save's — seeded so the zoom resumes where it was.
   * 32px-cell world: base zoom 2 for the pitched 2.5D framing (flat fallback 1) and the wheel
   * snaps through integer stops — a whole number of screen px per world px keeps every texel
   * the same size across the screen (a fractional zoom draws them 1 px and 2 px wide by turns).
   * The pitch still foreshortens rows by cos(pitch); only the horizontal scale is exact.
   */
  _camera(level) {
    const pitch = ColonyView.BB_PITCH;
    const baseZoom = pitch > 0 ? 2 : 1;
    const entities = level.entities;
    // Cap zoom-OUT to the world: viewCap = max view WIDTH (world px); the policy derives its live
    // zoom floor from it + the current surface each frame. Horizontal is the binding axis on a
    // landscape surface.
    const viewCap = level.grid.cols * level.grid.cellWidth;
    let id = entities.first(Camera);
    if (id === -1) {
      const sp = ColonyMap.of(level).spawn;
      id = Cameras.create(entities, {
        x: sp.x,
        y: sp.y,
        pitch: (pitch * Math.PI) / 180, // frame-0 seed; the curve overwrites it every update
        // ortho eye distance: the 100 default near-clips close ground at steep pitch
        // (a black band along the screen bottom); image-identical otherwise under ortho
        dist: 2000,
        zoom: baseZoom,
      });
    }
    const curve = ColonyView.PITCH_CURVE;
    entities.mint(
      id,
      CameraFollow,
      Cameras.follow({
        lerp: 0.15,
        pitch: pitch,
        // pitch-by-zoom (upright-sprite camera) — see ColonyView.PITCH_CURVE
        pitchLo: curve.pitchLo,
        pitchHi: curve.pitchHi,
        zoomLo: curve.zoomLo,
        zoomHi: curve.zoomHi,
        zoom: entities.require(id, Camera).zoom, // the target resumes at the persisted zoom
        zoomHome: baseZoom,
        viewCap: viewCap, // live zoom-out cap: view width ≤ this (no dark void past the map)
        zoomMax: 3, // one integer stop of zoom-in headroom
        zoomSteps: [0.5, 1, 2, 3],
        // Edge-clamp the look-at to the finite world so the pitched view never shows past a map
        // edge. gridToWorld anchors cell 0 at world (0,0).
        bounds: {
          x1: 0,
          y1: 0,
          x2: level.grid.cols * level.grid.cellWidth,
          y2: level.grid.rows * level.grid.cellHeight,
        },
      }),
    );
    CameraSystem.view(level).assign(0);
  },
};

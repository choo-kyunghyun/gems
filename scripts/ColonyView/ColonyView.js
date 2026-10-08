/**
 * The colony's presentation over a mounted level: its stage, a pass stack derived on the level's
 * own entity and freed with it, and its camera.
 *
 * Only reads the level, save its camera — an entity of the level's store under this engine's
 * follow policy. No map state lives here. The atmosphere constants are this engine's tuning of
 * the pitched 2.5D framing that every pass and the camera agree on.
 *
 * @typedef {Object} ColonyStage
 * @property {Renderer} renderer  the pass stack
 * @property {RenderDebugEntity} bbox  the bounding-box overlay, toggled per frame by its owner
 * @property {function(): void} destroy  frees the pass stack
 */
globalThis.ColonyView = {
  // Camera pitch in degrees (0 = flat, debug only — front-view art reads wrong flat): the
  // frame-0 seed and the pitched-map gate; the live pitch follows PITCH_CURVE.
  BB_PITCH: 42,
  // Pitch by zoom: look further = flatter.
  PITCH_CURVE: { pitchLo: 42, pitchHi: 58, zoomLo: 1.25, zoomHi: 2.625 },
  // Clip depth either side of the look-at, world px: past any ground the widest view shows.
  DEPTH: 8000,
  KEY: "colony_stage", // the stage's derived token on the level's own entity

  /**
   * The world's albedo chroma this frame, pulled toward 1 (the authored colours) by the
   * `worldChroma` setting — 0 turns the atmosphere off, 1 is the full schedule.
   */
  chroma() {
    const k = Daylight.chroma() * Weather.chromaMod();
    return 1 - (1 - k) * Settings.get("worldChroma");
  },

  /** The level's stage, built on the first ask. */
  stage(level) {
    return level.entities.derive(level.self, ColonyView.KEY, () => ColonyView._renderer(level));
  },

  /** Grass clump defs for the ground's types; the biome profile's clump sheet and extras override. */
  _clumpDefs(types, profile) {
    const clumpSprite = profile !== undefined ? profile.clumpSprite : undefined;
    const extra = profile !== undefined ? profile.clutter : undefined;
    const defs = [];
    for (let i = 0; i < types.length; i++) {
      const mat = types[i].key;
      const def = contentBiomes.MATERIALS[mat];
      if (def === undefined) continue;
      const rows = [];
      if (def.clump !== undefined)
        rows.push({
          src: def.clump,
          sprite: clumpSprite !== undefined ? clumpSprite : def.clump.sprite,
        });
      if (def.clutter !== undefined)
        for (let k = 0; k < def.clutter.length; k++)
          rows.push({ src: def.clutter[k], sprite: def.clutter[k].sprite });
      const own = extra !== undefined ? extra[mat] : undefined;
      if (own !== undefined)
        for (let k = 0; k < own.length; k++)
          rows.push({ src: own[k], sprite: own[k].sprite });
      for (let k = 0; k < rows.length; k++) {
        const src = rows[k].src;
        defs.push({
          id: types[i].id,
          sprite: rows[k].sprite,
          min: src.min,
          max: src.max,
          chance: src.chance,
          scaleMin: src.scaleMin,
          scaleMax: src.scaleMax,
          edge: src.edge,
          flat: src.flat,
        });
      }
    }
    return defs;
  },

  /**
   * A terrain pass's `wave` option for a material id, on the weather's sim clock so the crests
   * freeze on pause; undefined for still ground.
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
   * The renderer pass stack, inserted in draw order: the ground, the resident tiles, the overlays
   * under the bodies, the meshes and lit walls of a pitched map, the bodies, the overlays over
   * them, the sky and the lighting, then the world-space cues bright above its tint.
   */
  _renderer(level) {
    const pitch = ColonyView.BB_PITCH;
    const ctx = {
      level: level,
      camera: CameraSystem.view(level),
      renderer: new Renderer(),
      lit: [], // the flat passes that share the mesh pass's light gather on a pitched map
      wall: undefined, // the lit-box wall pass, absent on a flat map
    };
    ColonyView._ground(ctx);
    ColonyView._tiles(ctx, pitch);
    ColonyView._underlays(ctx);
    const meshPass = pitch > 0 ? ColonyView._mesh(ctx) : undefined;
    // Pitched maps light the sprites like the mesh faces.
    ctx.renderer.insert(
      pitch > 0
        ? new RenderBillboard({ lights: meshPass, camera: ctx.camera })
        : new RenderEntity(),
    );
    const bbox = ColonyView._overlays(ctx);
    ColonyView._sky(ctx);
    // Lighting last, composited over everything; day/night is its ambient term.
    ctx.renderer.insert(
      new RenderLighting({
        ambient: () => Daylight.tint(),
        vignette: 0, // the flat look: night is one even multiply
        camera: ctx.camera,
      }),
    );
    ctx.renderer.insert(new RenderWorldOverlay({ level: ctx.level, camera: ctx.camera }));
    // additive, so bright over the day/night tint
    ctx.renderer.insert(new RenderParticles({ level: ctx.level, camera: ctx.camera }));
    ctx.renderer.insert(new RenderFloatingText({ level: ctx.level, camera: ctx.camera }));
    const renderer = ctx.renderer;
    return { renderer, bbox, destroy: () => renderer.destroy() };
  },

  /**
   * The generated ground under everything: a biome's materials stacked lowest first, an upper
   * material's transparent corners revealing the one below — the A-over-B transition the tile sets
   * are drawn for.
   */
  _ground(ctx) {
    const level = ctx.level;
    const keys = ColonyMap.of(level).terrain;
    if (keys === undefined) return;
    const layer = level.grid.layer("terrain");
    const types = [];
    const stack = [];
    for (let i = 0; i < keys.length; i++) {
      const type = layer.type(keys[i]);
      types.push(type);
      const m = contentBiomes.MATERIALS[keys[i]];
      if (m === undefined) {
        // a saved material gone from the content since
        Log.warn(`terrain material missing: ${keys[i]}`);
        continue;
      }
      stack.push({ type: type, tileset: m.tileset, wave: ColonyView._wave(keys[i]) });
    }
    const pass = new RenderTerrain(layer, level.grid, stack);
    ctx.lit.push(pass);
    ctx.renderer.insert(pass);
    // Upright grass clumps enter the depth pool over the finished ground, before the entities.
    const profile = contentBiomes.BIOMES[level.entities.get(level.self, ColonyMap.BIOME)];
    const cdefs = ColonyView._clumpDefs(types, profile);
    if (cdefs.length === 0) return;
    // a save without the wind record falls back to the biome profile
    let wind = level.entities.get(level.self, ColonyMap.WIND);
    if (wind === undefined)
      wind = profile !== undefined && profile.wind !== undefined ? profile.wind : 0;
    const grass = new RenderGrass(layer, level.grid, cdefs, {
      wind: wind,
      time: () => Weather.time(),
      camera: ctx.camera,
    });
    ctx.lit.push(grass);
    ctx.renderer.insert(grass);
  },

  /**
   * Resident tile layers, bottom to top, one pass per material sheet on a materials layer. An
   * empty layer emits no quads, so unbuilt floor/fence layers are free.
   */
  _tiles(ctx, pitch) {
    const level = ctx.level;
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (cfg.key === "wall") continue; // lit boxes; no flat fallback
      if (cfg.key === "fence" && pitch > 0) continue; // lit boxes
      if (cfg.key === "terrain" && ColonyMap.of(level).terrain !== undefined) continue; // the ground's stack
      const layer = level.grid.layer(cfg.key);
      if (cfg.materials === undefined) {
        const pass = new RenderTileMap(layer, level.grid, cfg.sprite, {
          autotile: cfg.type,
          color: Color.parse(cfg.color),
          camera: ctx.camera,
        });
        ctx.lit.push(pass);
        ctx.renderer.insert(pass);
        continue;
      }
      for (let m = 0; m < cfg.materials.length; m++) {
        const mat = cfg.materials[m];
        const pass = new RenderTileMap(layer, level.grid, mat.sprite, {
          autotile: cfg.type,
          match: mat.id,
          color: Color.parse(mat.color),
          camera: ctx.camera,
        });
        ctx.lit.push(pass);
        ctx.renderer.insert(pass);
      }
    }
  },

  /**
   * Under the bodies: the inspection overlays, off until toggled and camera-culled for large
   * maps, then the foot shadows.
   */
  _underlays(ctx) {
    const grid = ctx.level.grid;
    const costPass = new RenderDebugTileMap(grid, {
      cost: true,
      tiles: false,
      alpha: 0.5,
      camera: ctx.camera,
    });
    costPass.enabled = false;
    ctx.renderer.insert(costPass);
    const gridPass = new RenderGrid(grid, { camera: ctx.camera });
    gridPass.enabled = false;
    ctx.renderer.insert(gridPass);
    // A body lying flat casts no shadow, nor a ground item, whose box is a pick area rather than
    // a footprint; NPCs carry no Health, so a corpse is known by its interaction kind.
    ctx.renderer.insert(
      new RenderEntityShadow({
        filter: (entities, id) => {
          if (entities.has(id, Downed)) return false;
          const it = entities.get(id, Interaction);
          // `?:` not `||` (docs/GMRT.md)
          return it !== undefined ? it.kind !== "corpse" && it.kind !== "pickup" : true;
        },
      }),
    );
  },

  /**
   * A pitched map's deep-furniture meshes, which share the depth pool — a flat map has no
   * depth-writing entity pass to sort against — then its lit walls and fences. Lights are
   * injected because the pass is Core; seed = entity id keeps the mesh flicker in phase with the
   * glow pools. Returns the mesh pass, whose light gather the flat passes share.
   */
  _mesh(ctx) {
    const grid = ctx.level.grid;
    const meshPass = new RenderMesh({
      sun: () => Daylight.sun(),
      chroma: () => ColonyView.chroma(),
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
      camera: ctx.camera,
    });
    ctx.renderer.insert(meshPass);
    // assigned late because the flat passes exist before it; flat maps stay unlit
    for (let i = 0; i < ctx.lit.length; i++) ctx.lit[i].lights = meshPass;
    // One lit-box pass covers every wall on the map.
    // The first material doubles as the default bucket for generated walls.
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
    ctx.wall = new RenderWalls(grid, grid.layer("wall"), {
      color: wallMats[0].color,
      sprite: wallMats[0].sprite,
      frame: 0,
      lights: meshPass,
      materials: wallMats,
      camera: ctx.camera,
    });
    ctx.renderer.insert(ctx.wall);
    // the flat fence config stays for the editor
    ctx.renderer.insert(
      new RenderFence(grid, grid.layer("fence"), {
        color: Color.parse(contentTiles.get("fence").color),
        lights: meshPass,
        camera: ctx.camera,
      }),
    );
    return meshPass;
  },

  /** The inspection overlays over the bodies, off until toggled; returns the bbox overlay. */
  _overlays(ctx) {
    const bbox = new RenderDebugEntity();
    bbox.enabled = Settings.get("debugBBox");
    ctx.renderer.insert(bbox);
    const paths = new RenderDebugPath(ctx.level.grid);
    paths.enabled = false;
    ctx.renderer.insert(paths);
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
    ctx.renderer.insert(ranges);
    return bbox;
  },

  /**
   * The sky overlay sits under the day/night tint so night darkens the rain, and is cut out over
   * every room — no weather under a roof. No open sky indoors.
   */
  _sky(ctx) {
    const level = ctx.level;
    if (level.entities.get(level.self, ColonyMap.INDOOR) === true) return;
    const clouds = new RenderCloudShadow({ camera: ctx.camera });
    clouds.enabled = false; // the flat look
    const weather = new RenderWeather({ camera: ctx.camera });
    const wall = ctx.wall;
    const roofH = wall !== undefined && wall.height !== undefined ? wall.height : 0;
    const rooms = RoomSystem.rooms(level);
    ctx.renderer.insert(
      new RenderOverlay({
        layers: [clouds, weather],
        cutout: () => rooms.map.cells(),
        tiles: level.grid,
        height: roofH,
        camera: ctx.camera,
      }),
    );
  },

  /**
   * Put the level's camera entity under the follow policy, once. A restored save keeps its
   * entity; the policy is rebuilt either way — its tuning is this engine's, not the save's — seeded
   * so the zoom resumes where it was. Zoom snaps through fixed stops.
   */
  camera(level) {
    const pitch = ColonyView.BB_PITCH;
    const baseZoom = pitch > 0 ? 2 : 1;
    const entities = level.entities;
    // Cap zoom-out to the world's width, the binding axis on a landscape surface.
    const viewCap = level.grid.cols * level.grid.cellWidth;
    let id = entities.first(Camera);
    if (id === -1) {
      const sp = ColonyMap.of(level).spawn;
      id = Cameras.create(entities, {
        x: sp.x,
        y: sp.y,
        pitch: (pitch * Math.PI) / 180, // frame-0 seed; the curve overwrites it
        // the eye at the look-at, the near plane behind it: a tile map culls around the eye
        // (docs/GMRT.md), and nothing on screen is then clipped
        dist: 1,
        znear: -ColonyView.DEPTH,
        zfar: ColonyView.DEPTH,
        zoom: baseZoom,
      });
    } else if (entities.has(id, CameraFollow)) return;
    const curve = ColonyView.PITCH_CURVE;
    entities.add(
      id,
      CameraFollow,
      {
        lerp: 0.15,
        pitch: pitch,
        pitchLo: curve.pitchLo,
        pitchHi: curve.pitchHi,
        zoomLo: curve.zoomLo,
        zoomHi: curve.zoomHi,
        zoomTarget: entities.require(id, Camera).zoom, // resume at the persisted zoom
        zoomHome: baseZoom,
        viewCap: viewCap,
        zoomMin: 0.5,
        zoomMax: 4, // one stop of zoom-in headroom
        zoomSteps: [0.5, 1, 2, 4],
        // the pitched view never shows past a map edge
        bounds: {
          x1: 0,
          y1: 0,
          x2: level.grid.cols * level.grid.cellWidth,
          y2: level.grid.rows * level.grid.cellHeight,
        },
      },
    );
  },
};

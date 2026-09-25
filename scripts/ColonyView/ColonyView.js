/**
 * The colony's presentation over a mounted level: a pass stack its caller owns and frees.
 *
 * Only reads the level, save its camera — an entity of the level's store, seeded before the
 * passes because every view-dependent pass takes its view at construction. No map state lives
 * here. The atmosphere constants are this engine's tuning of the pitched 2.5D framing that every
 * pass and the camera agree on.
 *
 * @typedef {Object} ColonyStage
 * @property {Renderer} renderer  the pass stack
 * @property {RenderDebugEntity} bbox  the bounding-box overlay, toggled per frame by its owner
 */
globalThis.ColonyView = {
  // Camera pitch in degrees (0 = flat, debug only — front-view art reads wrong flat): the
  // frame-0 seed and the pitched-map gate; the live pitch follows PITCH_CURVE.
  BB_PITCH: 42,
  // Pitch by zoom: look further = flatter. Zoom thresholds are tuned for the 32px-cell world.
  PITCH_CURVE: { pitchLo: 42, pitchHi: 58, zoomLo: 1.25, zoomHi: 2.625 },

  /**
   * The world's albedo chroma this frame, pulled toward 1 (the authored colours) by the
   * `worldChroma` setting — 0 turns the atmosphere off, 1 is the full schedule.
   */
  chroma() {
    const k = Daylight.chroma() * Weather.chromaMod();
    return 1 - (1 - k) * Settings.get("worldChroma");
  },

  /** The level's stage, built once per level on its first activation. */
  stage(level) {
    ColonyView._camera(level);
    return ColonyView._renderer(level);
  },

  /** Grass clump defs for a material table; the biome profile's tint and extras override. */
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
   * The renderer pass stack.
   *
   * A generated map's biome materials stack as one dual-grid pass per material, lowest first: an
   * upper material's transparent corners reveal the one below, the A-over-B transition the sets
   * are drawn for. `skipAbove` drops the quads the next material covers whole, so no material
   * draws its full extent under the ones above.
   */
  _renderer(level) {
    const pitch = ColonyView.BB_PITCH;
    const rt = ColonyMap.runtime(level);
    const camera = CameraSystem.view(level);
    const renderer = new Renderer();
    const terrainPasses = [];
    let grassPass;
    // Generated ground under everything.
    const mats = rt.terrainMats;
    if (mats !== undefined)
      for (let i = 0; i < mats.length; i++) {
        const spr = mats[i].sprite;
        if (!sprite_exists(spr)) {
          // a saved row whose art is gone since
          Log.warn(`terrain sprite missing: ${mats[i].material}`);
          continue;
        }
        const pass = new RenderTileMap(rt.terrainLayer, level.grid, spr, {
          autotile: "dual",
          minId: mats[i].type.id,
          skipAbove: i < mats.length - 1 ? mats[i + 1].type.id : undefined,
          wave: ColonyView._wave(mats[i].material),
        });
        terrainPasses.push(pass);
        renderer.insert(pass);
      }
    // Upright grass clumps enter the depth pool over the finished ground, before the entities.
    if (mats !== undefined) {
      const profile = contentBiomes.BIOMES[level.entities.get(level.self, ColonyMap.BIOME)];
      const cdefs = ColonyView._clumpDefs(mats, profile);
      if (cdefs.length > 0) {
        // a save without the wind record falls back to the biome profile
        let wind = level.entities.get(level.self, ColonyMap.WIND);
        if (wind === undefined)
          wind = profile !== undefined && profile.wind !== undefined ? profile.wind : 0;
        grassPass = new RenderGrass(rt.terrainLayer, level.grid, cdefs, {
          wind: wind,
          time: () => Weather.time(),
          camera: camera,
        });
        renderer.insert(grassPass);
      }
    }
    // Resident tile layers, bottom to top, keyed by layer — a materials layer by
    // `<layer>.<material>`, one pass per material sheet.
    // An empty layer emits no quads, so unbuilt floor/fence layers are free.
    const tilePasses = {};
    for (let i = 0; i < contentTiles.LAYERS.length; i++) {
      const cfg = contentTiles.LAYERS[i];
      if (cfg.key === "wall") continue; // lit boxes below; no flat fallback
      if (cfg.key === "fence" && pitch > 0) continue; // lit boxes below
      if (cfg.key === "terrain" && mats !== undefined) continue; // the material stack above
      const layer = rt[cfg.key + "Layer"];
      if (cfg.materials === undefined) {
        const pass = new RenderTileMap(layer, level.grid, cfg.sprite, {
          autotile: cfg.type,
          color: Color.parse(cfg.color),
        });
        tilePasses[cfg.key] = pass;
        renderer.insert(pass);
        continue;
      }
      for (let m = 0; m < cfg.materials.length; m++) {
        const mat = cfg.materials[m];
        const pass = new RenderTileMap(layer, level.grid, mat.sprite, {
          autotile: cfg.type,
          match: mat.id,
          color: Color.parse(mat.color),
        });
        tilePasses[cfg.key + "." + mat.key] = pass;
        renderer.insert(pass);
      }
    }
    // inspection overlays, off until toggled; camera-culled for large maps
    const costPass = new RenderDebugTileMap(level.grid, {
      cost: true,
      tiles: false,
      alpha: 0.5,
      camera: camera,
    });
    costPass.enabled = false;
    renderer.insert(costPass);
    const gridPass = new RenderGrid(level.grid, { camera: camera });
    gridPass.enabled = false;
    renderer.insert(gridPass);
    // Foot shadows under the entities. A body lying flat casts none; NPCs carry no Health, so a
    // corpse is known by its interaction kind.
    renderer.insert(
      new RenderEntityShadow({
        filter: (entities, id) => {
          if (entities.has(id, Downed)) return false;
          const it = entities.get(id, Interaction);
          return it !== undefined ? it.kind !== "corpse" : true; // `?:` not `||` (docs/GMRT.md)
        },
      }),
    );
    // Deep-furniture meshes share the depth pool, so pitched maps only — a flat map has no
    // depth-writing entity pass to sort against. Lights are injected because the pass is Core;
    // seed = entity id keeps the mesh flicker in phase with the glow pools.
    let meshPass;
    if (pitch > 0) {
      meshPass = new RenderMesh({
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
        camera: camera,
      });
      renderer.insert(meshPass);
      // The ground shares this pass's light gather; assigned late because the ground passes
      // exist before it. Flat maps stay unlit.
      for (let i = 0; i < terrainPasses.length; i++)
        terrainPasses[i].lights = meshPass;
      if (grassPass !== undefined) grassPass.lights = meshPass;
      const tileKeys = Object.keys(tilePasses);
      for (let i = 0; i < tileKeys.length; i++)
        tilePasses[tileKeys[i]].lights = meshPass;
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
      tilePasses.wall = new RenderWalls(level.grid, rt.wallLayer, {
        color: wallMats[0].color,
        sprite: wallMats[0].sprite,
        frame: 0,
        lights: meshPass,
        materials: wallMats,
      });
      renderer.insert(tilePasses.wall);
      // the flat fence config stays for the editor
      tilePasses.fence = new RenderFence(level.grid, rt.fenceLayer, {
        color: Color.parse(contentTiles.get("fence").color),
        lights: meshPass,
      });
      renderer.insert(tilePasses.fence);
    }
    // Pitched maps light the sprites like the mesh faces.
    renderer.insert(
      pitch > 0
        ? new RenderBillboard({ lights: meshPass, camera: camera })
        : new RenderEntity(),
    );
    const bbox = new RenderDebugEntity();
    bbox.enabled = Settings.get("debugBBox");
    renderer.insert(bbox);
    const paths = new RenderDebugPath(level.grid);
    paths.enabled = false;
    renderer.insert(paths);
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
    // The sky overlay sits under the day/night tint so night darkens the rain, and is cut out
    // over every room — no weather under a roof. No open sky indoors.
    if (level.entities.get(level.self, ColonyMap.INDOOR) !== true) {
      const clouds = new RenderCloudShadow({ camera: camera });
      clouds.enabled = false; // the flat look
      const weather = new RenderWeather({ camera: camera });
      const wall = tilePasses.wall; // absent on a flat map
      const roofH =
        wall !== undefined && wall.height !== undefined ? wall.height : 0;
      const rooms = RoomSystem.rooms(level);
      renderer.insert(
        new RenderOverlay({
          layers: [clouds, weather],
          cutout: () => rooms.map.rects(),
          height: roofH,
          camera: camera,
        }),
      );
    }
    // Lighting last, composited over everything; day/night is its ambient term.
    renderer.insert(
      new RenderLighting({
        ambient: () => Daylight.tint(),
        vignette: 0, // the flat look: night is one even multiply
        camera: camera,
      }),
    );
    return { renderer, bbox };
  },

  /**
   * The level's camera entity under the follow policy. A restored save keeps its entity; the
   * policy is minted either way — its tuning is this engine's, not the save's — seeded so the
   * zoom resumes where it was. Zoom snaps through integer stops so every texel is the same size
   * on screen; only the horizontal scale is exact under pitch.
   */
  _camera(level) {
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
        // the default eye distance near-clips close ground at steep pitch
        dist: 2000,
        zoom: baseZoom,
      });
    }
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
        zoomMax: 3, // one integer stop of zoom-in headroom
        zoomSteps: [0.5, 1, 2, 3],
        // the pitched view never shows past a map edge
        bounds: {
          x1: 0,
          y1: 0,
          x2: level.grid.cols * level.grid.cellWidth,
          y2: level.grid.rows * level.grid.cellHeight,
        },
      },
      { mint: true },
    );
    CameraSystem.view(level).assign(0);
  },
};

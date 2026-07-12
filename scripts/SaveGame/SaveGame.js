// SaveGame — the RPG's disk save/load driver (Demo). Composes a Snapshot (the Core pass frame)
// with the RPG's capture/restore PASSES and owns the slot layout, the metadata index, and disk I/O.
//
// Layout (a slot is a directory — subdir writes auto-create on GMRT; #15223 only hits the async
// default/ path, see docs/GMRT.md):
//   saves/index.json         { slots: { <slot>: <meta header> } } — the load menu reads THIS (GMRT's
//                            file_find_first scans the build dir, NOT the save area, so a directory
//                            scan can't see saves — the index is the source of truth).
//   saves/<slot>/manifest.json   the JSON half of the hybrid bundle (metadata, world-sim, and each
//                            map's component export — variable/structured data).
//   saves/<slot>/<blob>.bin      the binary half (dense tile grids; chunk cache is the deep follow-up).
//
// Passes run in insert order both ways; capture and restore live on the same pass object so they
// can't drift. RESTORE is the follow-up step — the passes below capture fully; their restore()s are
// stubs pending the create() load-branch.
globalThis.SaveGame = {
  DIR: "saves/",
  INDEX: "saves/index.json",
  _frame: null, // lazily-composed Snapshot (the pass stack)

  // Compose the pass stack once. Order matters for restore: maps rebuild before world-sim reads
  // the active map, etc. (locked in when restore lands).
  frame() {
    if (SaveGame._frame === null) {
      SaveGame._frame = new Snapshot();
      SaveGame._frame.insert(SaveGame._metaPass);
      SaveGame._frame.insert(SaveGame._simPass);
      SaveGame._frame.insert(SaveGame._mapsPass);
    }
    return SaveGame._frame;
  },

  /**
   * Capture the whole session into slot `slot` (a directory under saves/) + refresh the index.
   * @param {Object} scene the live RPG scene
   * @param {string} slot slot id (a bare name — becomes saves/<slot>/)
   * @returns {boolean}
   */
  save(scene, slot) {
    const t0 = current_time;
    const bundle = SaveGame.frame().capture(scene);
    const dir = SaveGame.DIR + slot + "/";
    File.write(dir + "manifest.json", Json.encode(bundle.manifest));
    // binary blobs — the bundle owns them; write then free
    for (let i = 0; i < bundle.blobs.length; i++) {
      const b = bundle.blobs[i];
      File.writeBuffer(dir + b.name + ".bin", b.buffer);
      buffer_delete(b.buffer);
    }
    SaveGame._writeIndex(slot, bundle.manifest.meta);
    Log.info(
      "SaveGame: saved '" + slot + "' — " + bundle.manifest.maps.length +
      " map(s), " + bundle.blobs.length + " blob(s) in " + (current_time - t0) + "ms",
    );
    return true;
  },

  /** @returns {Object<string,Object>} slot -> meta header, for the load menu. */
  list() {
    return SaveGame._readIndex().slots;
  },

  /** @returns {boolean} whether a slot exists in the index. */
  has(slot) {
    return SaveGame._readIndex().slots[slot] !== undefined;
  },

  // index read-modify-write. The index is the authoritative slot list (find can't scan the save area).
  _writeIndex(slot, meta) {
    const idx = SaveGame._readIndex();
    idx.slots[slot] = meta;
    File.write(SaveGame.INDEX, Json.encode(idx));
  },
  _readIndex() {
    const raw = File.read(SaveGame.INDEX);
    if (raw !== undefined) {
      const d = Json.decode(raw);
      if (d !== undefined && d.slots !== undefined) return d;
    }
    return { slots: {} };
  },

  // ── PASSES ── plain { id, capture, restore } objects, defined here (content, not machinery) —
  // the same "passes live with the composition" pattern OverworldGen uses for its scatters.

  // metadata header: the at-a-glance card the load menu shows (never applied on restore).
  _metaPass: {
    id: "meta",
    capture(ctx) {
      const scene = ctx.scene;
      const w = scene.world;
      const pid = scene.playerId;
      const health = pid !== undefined ? w.get(Health, pid) : undefined;
      const stats = pid !== undefined ? w.get(Stats, pid) : undefined;
      const inv = pid !== undefined ? w.get(Inventory, pid) : undefined;
      ctx.manifest.activeMap = World.levels.activeId();
      ctx.manifest.meta = {
        version: Snapshot.VERSION,
        savedAt: new Date().toISOString(), // clean wall-clock stamp (date_datetime_string is garbled on GMRT)
        map: World.levels.activeId(),
        day: WorldClock.day,
        season: WorldClock.season().id,
        clock: WorldClock.clockText(),
        hp: health !== undefined ? Math.round(health.hp) : 0,
        maxHp: stats !== undefined ? stats.maxHp : 0,
        credits: inv !== undefined ? SaveGame._credits(inv) : 0,
      };
    },
    restore(_ctx) {}, // header is informational — nothing to apply
  },

  // world-scope singletons: clock, weather, lifetime counters, achievement unlocks.
  _simPass: {
    id: "sim",
    capture(ctx) {
      const ach = [];
      const all = Achievement.all();
      for (let i = 0; i < all.length; i++)
        if (Achievement.isUnlocked(all[i].id)) ach.push(all[i].id);
      ctx.manifest.sim = {
        clock: { hour: WorldClock.hour, day: WorldClock.day },
        // Weather has no export() yet — read its flat static state directly (Demo-internal coupling).
        weather: {
          ambient: Weather._ambient,
          override: Weather._override,
          regionTemp: Weather._regionTemp,
          cur: Weather._cur,
          prev: Weather._prev,
          blend: Weather._blend,
          timer: Weather._timer,
          time: Weather._time,
        },
        profile: Profile.counters(),
        achievements: ach,
      };
    },
    restore(_ctx) {}, // TODO(restore): apply clock/weather/profile/achievements
  },

  // per-map state: entities (JSON component export) + tile grids (binary blob) + build state + zones.
  _mapsPass: {
    id: "maps",
    capture(ctx) {
      const activeId = World.levels.activeId();
      const ids = World.levels.ids();
      const maps = [];
      for (let m = 0; m < ids.length; m++) {
        const mapId = ids[m];
        // the ACTIVE map's live truth is on the scene (its registry entry is minimal until a
        // suspend overwrites it); parked maps carry their full bundle in the registry.
        const src = mapId === activeId ? ctx.scene : World.levels.entryOf(mapId);
        if (src === null || src.world === undefined) continue;
        const world = src.world;
        const grid = src.level;
        // component export → JSON, minus transient/rebuilt components (interpolation + pathfinding
        // are re-derived each tick; dropping them also shrinks the save and dodges any cyclic
        // reference a runtime component might carry — see Json's cycle guard).
        const exp = world.export();
        delete exp.components["PrevPosition"];
        delete exp.components["PathRequest"];
        delete exp.components["PathResponse"];
        const blobName = "grid_" + mapId;
        SaveGame._packGrid(grid, ctx, blobName);
        maps.push({
          id: mapId,
          chunked: src._chunked === true,
          indoor: src._indoor === true,
          reachDone: src.reachDone === true,
          buildZoneId: src.buildZoneId,
          built: src._built !== undefined ? src._built : {},
          builtEnts: src._builtEnts !== undefined ? src._builtEnts : {},
          world: exp,
          gridBlob: blobName,
          gridMeta: SaveGame._gridMeta(grid),
        });
      }
      ctx.manifest.maps = maps;
    },
    restore(_ctx) {}, // TODO(restore): rebuild each map from file, then overwrite world/grid/build
  },

  // ── helpers ──

  // Pack all of a level's tile layers into one binary blob: a small header then, per layer, one
  // u16 per cell = TileType.id + 1 (0 = empty, so id 0 doesn't collide with the empty sentinel).
  // Dense grids as objects-per-cell in JSON would dwarf the rest of the save — this is the binary
  // half of the hybrid bundle.
  _packGrid(grid, ctx, name) {
    const layers = grid.layers;
    const cols = grid.cols;
    const rows = grid.rows;
    const cells = cols * rows;
    const buf = buffer_create(6 + layers.length * cells * 2, buffer_grow, 1);
    buffer_write(buf, buffer_u16, layers.length);
    buffer_write(buf, buffer_u16, cols);
    buffer_write(buf, buffer_u16, rows);
    for (let l = 0; l < layers.length; l++) {
      const layer = layers[l];
      // TileLayer exposes its cells via export().data (array of TileType|0); guard a non-tile layer.
      const data =
        layer.export !== undefined ? layer.export().data : undefined;
      for (let c = 0; c < cells; c++) {
        const cell = data !== undefined ? data[c] : 0;
        const v =
          cell === 0 || cell === undefined || cell.id === undefined
            ? 0
            : cell.id + 1;
        buffer_write(buf, buffer_u16, v);
      }
    }
    ctx.putBlob(name, buf);
  },

  // grid dimensions + layer count + zone channels (JSON — zones are sparse regions, and
  // zoneMap.export() is already the disk-safe form the level editor writes).
  _gridMeta(grid) {
    const zones = {};
    const keys = Object.keys(grid.zoneMaps);
    for (let i = 0; i < keys.length; i++)
      zones[keys[i]] = grid.zoneMaps[keys[i]].export();
    return {
      cols: grid.cols,
      rows: grid.rows,
      cellW: grid.cellWidth,
      cellH: grid.cellHeight,
      layers: grid.layers.length,
      zones,
    };
  },

  // sum of the currency item in a bag (for the metadata card).
  _credits(inv) {
    let n = 0;
    const slots = inv.slots;
    for (let i = 0; i < slots.length; i++)
      if (slots[i].itemId === "coin") n += slots[i].qty;
    return n;
  },
};

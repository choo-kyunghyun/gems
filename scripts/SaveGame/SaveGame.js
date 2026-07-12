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
  _pending: null, // a loaded bundle awaiting the RPG scene's create() load-branch

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

  // ── load ──

  /**
   * Read a slot's bundle off disk and PARK it for the RPG scene's create() load-branch (the
   * actual reconstruction needs a fresh scene). The caller then boots/switches to SceneRpg.
   * @param {string} slot @returns {boolean} false if the slot can't be read
   */
  load(slot) {
    const dir = SaveGame.DIR + slot + "/";
    const raw = File.read(dir + "manifest.json");
    if (raw === undefined) {
      Log.error("SaveGame: no manifest for slot '" + slot + "'");
      return false;
    }
    const manifest = Json.decode(raw); // revives {"$spr"} tags → live sprite refs
    if (manifest === undefined) {
      Log.error("SaveGame: manifest for '" + slot + "' is corrupt");
      return false;
    }
    // load every referenced binary blob (name -> buffer; freed after restore runs)
    const blobs = {};
    const maps = manifest.maps !== undefined ? manifest.maps : [];
    for (let i = 0; i < maps.length; i++) {
      const name = maps[i].gridBlob;
      if (name === undefined) continue;
      const buf = File.readBuffer(dir + name + ".bin");
      if (buf !== undefined) blobs[name] = buf;
    }
    SaveGame._pending = { manifest, blobs, slot };
    return true;
  },

  /** @returns {boolean} a bundle is parked for the load-branch. */
  pending() {
    return SaveGame._pending !== null;
  },

  /**
   * Reconstruct the session into a FRESH RPG scene — called from sceneRpg.create()'s load-branch
   * in place of the new-game map+player seeding. Runs the frame's restore passes, then frees the
   * loaded blobs. Clears the pending bundle.
   * @param {Object} scene the fresh RPG scene
   */
  restore(scene) {
    const p = SaveGame._pending;
    if (p === null) return;
    SaveGame._pending = null;
    SaveGame.frame().restore(scene, p.manifest, p.blobs);
    const names = Object.keys(p.blobs);
    for (let i = 0; i < names.length; i++) buffer_delete(p.blobs[names[i]]);
    Log.info("SaveGame: restored slot '" + p.slot + "'");
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
    restore(ctx) {
      const sim = ctx.manifest.sim;
      if (sim === undefined) return;
      WorldClock.hour = sim.clock.hour;
      WorldClock.day = sim.clock.day;
      // restore Weather's flat static state (symmetric with capture; no _sync needed — the fields
      // fully define the sky, and the next update() re-syncs from them).
      const w = sim.weather;
      Weather._ambient = w.ambient;
      Weather._override = w.override;
      Weather._regionTemp = w.regionTemp;
      Weather._cur = w.cur;
      Weather._prev = w.prev;
      Weather._blend = w.blend;
      Weather._timer = w.timer;
      Weather._time = w.time;
      // lifetime counters + achievement unlocks
      const prof = sim.profile;
      const pk = Object.keys(prof);
      for (let i = 0; i < pk.length; i++) Profile.set(pk[i], prof[pk[i]]);
      Profile.save();
      for (let i = 0; i < sim.achievements.length; i++)
        Achievement.unlock(sim.achievements[i]);
    },
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
    // v1 (Full-session): rebuild the ACTIVE map fresh from file and re-arrive the SAVED squad
    // (player + companions) through the existing portal-transfer machinery, then drop the player
    // back at its saved position. Wilderness/hub/NPCs regenerate deterministically from seed.
    // TODO(deep): per-map build state (grid unpack + built entities + zones), non-active maps,
    // and the ChunkManager cache pass — see docs.
    restore(ctx) {
      const scene = ctx.scene;
      const manifest = ctx.manifest;
      const activeMap = manifest.activeMap;
      let active = null;
      const maps = manifest.maps !== undefined ? manifest.maps : [];
      for (let i = 0; i < maps.length; i++)
        if (maps[i].id === activeMap) active = maps[i];
      if (active === null) {
        Log.error("SaveGame: active map '" + activeMap + "' missing from save");
        return;
      }
      const squad = SaveGame._extractSquad(active.world);
      if (squad === null) {
        Log.error("SaveGame: no player in save — cannot restore");
        return;
      }
      // a load boot never ran the new-game go(null) that binds the keymap; do it explicitly.
      PlayerSystem.bindKeys();
      // build the saved active map fresh, arriving the restored squad at its default entry
      RpgMap.build(scene, activeMap, "default", squad);
      // then move the player from the entry back to where it was saved
      const pinfo = SaveGame._playerPos(active.world);
      if (pinfo !== null && scene.playerId !== undefined) {
        const pos = scene.world.get(Position, scene.playerId);
        if (pos !== undefined) {
          pos.x = pinfo.x;
          pos.y = pinfo.y;
          pos.z = pinfo.z !== undefined ? pinfo.z : 0;
        }
        if (scene.camera !== undefined) {
          scene.camera.toX = pinfo.x;
          scene.camera.toY = pinfo.y;
        }
        if (scene.chunks !== undefined) scene.chunks.update(pinfo.x, pinfo.y);
      }
    },
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

  // ── menu UI (injected into SystemMenu as an extra tab; see obj_game Create_0) ──
  SLOTS: 3, // fixed named save slots shown in the menu

  // Build the Save/Load tab content — a slot list, each row a live metadata label + Save/Load.
  // Called fresh on each menu open, so the rows reflect the current index. English literals for
  // now (i18n is a cleanup follow-up).
  buildMenuTab() {
    const scroll = gemsScroll({ grow: true });
    const sec = gemsSection(() => "SAVE / LOAD");
    for (let i = 1; i <= SaveGame.SLOTS; i++)
      sec.insertChild(SaveGame._slotRow("slot" + i, i));
    scroll.scrollBody.insertChild(sec);
    return scroll;
  },

  _slotRow(slot, n) {
    const row = new UIElement({
      width: "100%",
      height: GemsTheme.rowH,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    // live label (function ref re-reads the index each frame → updates in place after a save)
    const wrap = new UIElement({
      flexGrow: 1,
      height: "100%",
      justifyContent: "center",
    });
    wrap.insertChild(gemsLabel(() => SaveGame._slotText(slot, n), {
      color: GemsTheme.text,
    }));
    row.insertChild(wrap);
    row.insertChild(
      gemsButton(() => "Save", () => SaveGame._menuSave(slot, n), {
        width: 120,
        primary: true,
      }),
    );
    row.insertChild(
      gemsButton(() => "Load", () => SaveGame._menuLoad(slot, n), {
        width: 120,
      }),
    );
    return row;
  },

  _slotText(slot, n) {
    const meta = SaveGame.list()[slot];
    if (meta === undefined) return "Slot " + n + "  —  (empty)";
    return (
      "Slot " + n + "  —  Day " + meta.day + "  " + meta.clock +
      "   ·   " + meta.map + "   ·   " + meta.credits + " cr"
    );
  },

  // the current scene if it's saveable (has an ECS + player), else null — Save is gated on it.
  _saveable() {
    const g = SystemMenu._game;
    if (g === null) return null;
    const s = g.scenes.current;
    if (s === null || s === undefined || s.world === undefined || s.playerId === undefined)
      return null;
    return s;
  },

  _menuSave(slot, n) {
    const s = SaveGame._saveable();
    if (s === null) {
      Toast.push("Nothing to save here");
      return;
    }
    SaveGame.save(s, slot);
    Toast.push("Saved to slot " + n);
  },

  _menuLoad(slot, n) {
    if (!SaveGame.has(slot)) {
      Toast.push("Slot " + n + " is empty");
      return;
    }
    const g = SystemMenu._game;
    if (g === null) return;
    if (!SaveGame.load(slot)) {
      Toast.push("Load failed");
      return;
    }
    SystemMenu.close();
    g.scenes.switchTo(SceneRpg); // fresh RPG boot → create() load-branch → restore
  },

  // ── restore helpers: pull entities back out of a world export ──

  // the [index, data] entry for entity index `idx` in a component's sparse entry list, or undefined.
  _entryAt(entries, idx) {
    if (entries === undefined) return undefined;
    for (let i = 0; i < entries.length; i++)
      if (entries[i][0] === idx) return entries[i][1];
    return undefined;
  },

  // rebuild an EntitySnapshot record ({ components: {token:data} }) for one entity index — the shape
  // EntitySnapshot.apply/restore (and RpgMap._arriveSquad via World.levels.put) consume.
  _recordAt(exp, idx) {
    const comps = {};
    const toks = Object.keys(exp.components);
    for (let i = 0; i < toks.length; i++) {
      const data = SaveGame._entryAt(exp.components[toks[i]], idx);
      if (data !== undefined) comps[toks[i]] = data;
    }
    return { components: comps };
  },

  // the SQUAD (player first, then companions sharing its Squad id) as whole-entity records — fed to
  // RpgMap.build as its `squad`, so the exact portal-transfer path re-lands the character intact.
  _extractSquad(exp) {
    const players = exp.components["Playable"];
    if (players === undefined || players.length === 0) return null;
    const pidx = players[0][0]; // the player's entity index
    const squads = exp.components["Squad"];
    let sid = null;
    if (squads !== undefined) {
      const pd = SaveGame._entryAt(squads, pidx);
      if (pd !== undefined) sid = pd.id;
    }
    const idxs = [pidx];
    if (sid !== null && squads !== undefined)
      for (let i = 0; i < squads.length; i++)
        if (squads[i][0] !== pidx && squads[i][1].id === sid)
          idxs.push(squads[i][0]);
    const out = [];
    for (let i = 0; i < idxs.length; i++) out.push(SaveGame._recordAt(exp, idxs[i]));
    return out;
  },

  // the player's saved Position, for repositioning after the entry arrival.
  _playerPos(exp) {
    const players = exp.components["Playable"];
    if (players === undefined || players.length === 0) return null;
    return SaveGame._entryAt(exp.components["Position"], players[0][0]) ?? null;
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

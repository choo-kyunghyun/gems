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
  // per-map saved state awaiting each map's first build after a load — the active map consumes its
  // entry immediately; a parked map consumes its entry when the player first portals to it (so a
  // visited map's builds/chunk-state don't rebuild fresh from file). mapId -> saved map entry.
  _pendingMaps: {},
  // runtime-rebuilt components dropped from every serialized entity (interpolation + pathfinding
  // are re-derived each tick; dropping them shrinks the save and avoids a cyclic runtime ref).
  _TRANSIENT: ["PrevPosition", "PathRequest", "PathResponse"],

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
    // binary blobs first — the bundle owns them; write, RECORD the name (so load is self-describing
    // for any pass's blobs, not hard-coded to one), then free. Currently no pass emits a blob (the
    // dense tile grid proved reproducible from the build log), so this is the hybrid channel kept
    // ready for future dense data.
    bundle.manifest._blobs = [];
    for (let i = 0; i < bundle.blobs.length; i++) {
      const b = bundle.blobs[i];
      File.writeBuffer(dir + b.name + ".bin", b.buffer);
      bundle.manifest._blobs.push(b.name);
      buffer_delete(b.buffer);
    }
    File.write(dir + "manifest.json", Json.encode(bundle.manifest));
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
    // load every blob the manifest recorded (name -> buffer; freed after restore runs)
    const blobs = {};
    const names = manifest._blobs !== undefined ? manifest._blobs : [];
    for (let i = 0; i < names.length; i++) {
      const buf = File.readBuffer(dir + names[i] + ".bin");
      if (buf !== undefined) blobs[names[i]] = buf;
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

  // stash every saved map so each map's build consumes its own state (active now, others on portal).
  _stashPending(maps) {
    SaveGame._pendingMaps = {};
    for (let i = 0; i < maps.length; i++)
      SaveGame._pendingMaps[maps[i].id] = maps[i];
  },

  /** Drop any stashed per-map state — a NEW game must not inherit a prior load's maps. */
  clearPending() {
    SaveGame._pendingMaps = {};
  },

  /** Consume a map's stashed state (applied once, at its first build after a load). @returns {Object|null} */
  takePendingMap(mapId) {
    const m = SaveGame._pendingMaps[mapId];
    if (m === undefined) return null;
    delete SaveGame._pendingMaps[mapId];
    return m;
  },

  /**
   * Apply a saved map's build state onto a freshly-built map: the claimed buildable zone, then the
   * tiles + built entities via Blueprint.stamp (each built entity carries its exact snapshot from
   * the world export, so a chest keeps its contents). Shared by the active-map restore and every
   * parked map's first build. The deep chunk cache is applied earlier, inside build().
   * @param {Object} scene @param {Object} savedMap a manifest maps[] entry
   */
  applyMapState(scene, savedMap) {
    const zones = savedMap.zones;
    if (zones !== undefined && zones.buildable !== undefined) {
      const zm = scene.level.zoneMap("buildable");
      if (zm !== undefined) zm.import(zones.buildable);
    }
    Blueprint.stamp(scene, 0, 0, SaveGame._buildPlan(savedMap));
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
        weather: Weather.export(),
        profile: Profile.counters(),
        achievements: ach,
      };
    },
    restore(ctx) {
      const sim = ctx.manifest.sim;
      if (sim === undefined) return;
      WorldClock.hour = sim.clock.hour;
      WorldClock.day = sim.clock.day;
      Weather.import(sim.weather);
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
        for (let t = 0; t < SaveGame._TRANSIENT.length; t++)
          delete exp.components[SaveGame._TRANSIENT[t]];
        // DEEP: chunk-owned wilderness/hub entities ride the chunk cache (exact state), NOT the world
        // export — exclude them here so they aren't saved twice, then capture the chunk delta.
        let chunkCache;
        if (src.chunks !== undefined) {
          SaveGame._excludeChunkOwned(exp, src.chunks);
          chunkCache = src.chunks.exportCache(SaveGame._TRANSIENT);
        }
        maps.push({
          id: mapId,
          chunked: src._chunked === true,
          indoor: src._indoor === true,
          reachDone: src.reachDone === true,
          buildZoneId: src.buildZoneId,
          built: src._built !== undefined ? src._built : {},
          builtEnts: src._builtEnts !== undefined ? src._builtEnts : {},
          world: exp,
          chunkCache: chunkCache, // undefined on plain maps (Json drops it)
          zones: SaveGame._zonesOf(grid), // claimed buildable zone (tiles come from `built` via Blueprint)
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
      const maps = manifest.maps !== undefined ? manifest.maps : [];
      // Stash EVERY saved map. The active one is applied by the build() below (RpgMap.build consults
      // takePendingMap for chunk cache + applyMapState); parked maps apply on their first portal.
      SaveGame._stashPending(maps);
      let active = null;
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
      // Build the active map, arriving the restored squad at its default entry. build() consumes the
      // active map's stashed state (deep chunk cache + builds + claimed zone).
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

  // Zone channels (JSON — zones are sparse regions, and zoneMap.export() is the disk-safe form the
  // level editor already writes). The resident TILE grid is NOT captured: it holds player builds
  // only, and those replay exactly from `built` via Blueprint.stamp on restore (file tiles come back
  // from the file), so a raw grid blob would be dead weight.
  _zonesOf(grid) {
    const zones = {};
    const keys = Object.keys(grid.zoneMaps);
    for (let i = 0; i < keys.length; i++)
      zones[keys[i]] = grid.zoneMaps[keys[i]].export();
    return zones;
  },

  // ── menu UI (injected into SystemMenu as an extra tab; see obj_game Create_0) ──
  SLOTS: 3, // fixed named save slots shown in the menu

  // Build the Save/Load tab content — a slot list, each row a live metadata label + Save/Load.
  // Called fresh on each menu open, so the rows reflect the current index.
  buildMenuTab() {
    const scroll = gemsScroll({ grow: true });
    const sec = gemsSection(I18n.textRef("SAVE_TITLE"));
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
      gemsButton(I18n.textRef("SAVE_ACTION"), () => SaveGame._menuSave(slot, n), {
        width: 120,
        primary: true,
      }),
    );
    row.insertChild(
      gemsButton(I18n.textRef("LOAD_ACTION"), () => SaveGame._menuLoad(slot, n), {
        width: 120,
      }),
    );
    return row;
  },

  _slotText(slot, n) {
    const meta = SaveGame.list()[slot];
    if (meta === undefined) return I18n.text("SAVE_SLOT_EMPTY", n);
    return I18n.text(
      "SAVE_SLOT_INFO",
      n,
      meta.day,
      meta.clock,
      meta.map,
      meta.credits,
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
      Toast.push(I18n.text("SAVE_TOAST_NOSCENE"));
      return;
    }
    SaveGame.save(s, slot);
    Toast.push(I18n.text("SAVE_TOAST_SAVED", n), { type: "success" });
  },

  _menuLoad(slot, n) {
    if (!SaveGame.has(slot)) {
      Toast.push(I18n.text("SAVE_TOAST_EMPTY", n));
      return;
    }
    const g = SystemMenu._game;
    if (g === null) return;
    if (!SaveGame.load(slot)) {
      Toast.push(I18n.text("SAVE_TOAST_LOADFAIL"), { type: "warn" });
      return;
    }
    SystemMenu.close();
    g.scenes.switchTo(SceneRpg); // fresh RPG boot → create() load-branch → restore
  },

  // ── restore helpers: pull entities back out of a world export ──

  // Drop a chunk manager's live SIM entities from a world export (they're saved in the chunk cache
  // instead). Filters each component's sparse entry list by entity INDEX; the id-pool export is left
  // as-is (restore reads specific entities out, never re-imports the whole export).
  _excludeChunkOwned(exp, chunks) {
    const ids = chunks.entityIds();
    if (ids.length === 0) return;
    const excl = {}; // index -> true (numeric-keyed plain object, not a Map — GMRT)
    for (let i = 0; i < ids.length; i++) excl[IdPool.getIndex(ids[i])] = true;
    const toks = Object.keys(exp.components);
    for (let t = 0; t < toks.length; t++) {
      const entries = exp.components[toks[t]];
      const kept = [];
      for (let e = 0; e < entries.length; e++)
        if (excl[entries[e][0]] !== true) kept.push(entries[e]);
      exp.components[toks[t]] = kept;
    }
  },

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

  // Turn a saved map's build state into a Blueprint plan: _built tiles + _builtEnts entities, each
  // entity carrying its EXACT snapshot pulled from the world export (so a built chest keeps its
  // contents, a turret its damage) — a stale/empty snapshot degrades to a fresh make() at stamp.
  _buildPlan(active) {
    const built = active.built !== undefined ? active.built : {};
    const be = active.builtEnts !== undefined ? active.builtEnts : {};
    const tiles = [];
    const bk = Object.keys(built);
    for (let i = 0; i < bk.length; i++) {
      const c = bk[i].split(",");
      tiles.push({ dx: Number(c[0]), dy: Number(c[1]), item: built[bk[i]] });
    }
    const ents = [];
    const ek = Object.keys(be);
    for (let i = 0; i < ek.length; i++) {
      const c = ek[i].split(",");
      const rec = be[ek[i]];
      const ent = { dx: Number(c[0]), dy: Number(c[1]), item: rec.itemId };
      const snap = SaveGame._recordAt(active.world, IdPool.getIndex(rec.ent));
      if (Object.keys(snap.components).length > 0) ent.snapshot = snap;
      ents.push(ent);
    }
    return { w: 0, h: 0, tiles, ents };
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

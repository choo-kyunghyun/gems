// SaveGame — the colony's disk save/load driver (Game). Composes a Snapshot (the Core pass frame)
// with the colony's capture/restore PASSES and owns the slot layout, the metadata index, and disk I/O.
/**
 * A save is the session AS IT STANDS: every resident map's grid cell for cell and its entity
 * store whole (each entity under its saved id — colliders, statics, builds and residents alike),
 * the world-sim, and the wandering traders' records + schedule. A load rebuilds nothing from a
 * seed, spawns nothing and re-meshes nothing — those are a map's FIRST-visit
 * path (ColonyMap.build); a saved map comes back through ColonyMap.restore, so the entity set
 * after a load is exactly the one that was saved.
 *
 * Layout (a slot is a directory — subdir writes auto-create on GMRT; #15223 only hits the async
 * default/ path, see docs/GMRT.md):
 *   saves/index.json         { slots: { <slot>: <meta header> } } — the load menu reads THIS
 *                            (file_find_first scans the build dir, NOT the save area, so a directory
 *                            scan can't see saves — the index is the source of truth).
 *   saves/<slot>/manifest.json   the JSON half of the hybrid bundle: metadata, world-sim, and one
 *                            entry per map — its store export, its id lists, and what its grid's
 *                            packed ids mean (see _mapsPass).
 *   saves/<slot>/map_<id>.bin    the binary half: that map's tile layers (LevelGrid.pack).
 * Passes run in insert order both ways; capture and restore live on the same pass object so they
 * can't drift. A manifest from another Snapshot.VERSION is refused at load — no migration.
 */
globalThis.SaveGame = {
  DIR: "saves/",
  INDEX: "saves/index.json",
  _frame: null, // lazily-composed Snapshot (the pass stack)
  _pending: null, // a loaded bundle awaiting the colony scene's create() load-branch
  // per-map saved state awaiting each map's first visit after a load — the active map's is taken
  // by the load boot, a parked map's when the player first travels to it (ColonyMap.go), so no
  // map comes back fresh from file. mapId -> { map: the manifest entry, buf: its grid blob }.
  // The buffer is owned here until taken (clearPending frees the rest).
  _pendingMaps: {},
  // runtime-rebuilt components dropped from every serialized entity (interpolation + pathfinding
  // are re-derived each tick, a puppet Instance is re-minted by SkeletonSystem — a restored handle
  // would be dead; dropping them shrinks the save and avoids a cyclic runtime ref).
  _TRANSIENT: ["PrevPosition", "PathRequest", "PathResponse", "Instance"],

  /**
   * Compose the pass stack once. Order matters for restore: maps rebuild before world-sim reads
   * the active map, etc. (locked in when restore lands).
   */
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
   * Capture the whole session into slot `slot` (a bare name — becomes saves/<slot>/) + refresh
   * the index.
   */
  save(scene, slot) {
    const t0 = current_time;
    const bundle = SaveGame.frame().capture(scene);
    const dir = SaveGame.DIR + slot + "/";
    // binary blobs first — the bundle owns them; write, RECORD the name (so load is self-describing
    // for any pass's blobs, not hard-coded to one), then free.
    bundle.manifest._blobs = [];
    for (let i = 0; i < bundle.blobs.length; i++) {
      const b = bundle.blobs[i];
      File.writeBuffer(dir + b.name + ".bin", b.buffer);
      bundle.manifest._blobs.push(b.name);
      buffer_delete(b.buffer);
    }
    const manifest = Json.encode(bundle.manifest);
    if (manifest === undefined) {
      Log.error("SaveGame: manifest encode aborted — '" + slot + "' not saved");
      return false;
    }
    File.write(dir + "manifest.json", manifest);
    SaveGame._writeIndex(slot, bundle.manifest.meta);
    Log.info(
      "SaveGame: saved '" +
        slot +
        "' — " +
        bundle.manifest.maps.length +
        " map(s), " +
        bundle.blobs.length +
        " blob(s) in " +
        (current_time - t0) +
        "ms",
    );
    return true;
  },

  /** slot -> meta header, for the load menu. */
  list() {
    return SaveGame._readIndex().slots;
  },

  has(slot) {
    return SaveGame._readIndex().slots[slot] !== undefined;
  },

  // ── load ──

  /**
   * Read a slot's bundle off disk and PARK it for the colony scene's create() load-branch (the
   * actual reconstruction needs a fresh scene). The caller then boots/switches to SceneColony.
   * Returns false if the slot can't be read.
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
    if (manifest.version !== Snapshot.VERSION) {
      Log.error(
        "SaveGame: slot '" +
          slot +
          "' is save version " +
          manifest.version +
          ", this build reads " +
          Snapshot.VERSION,
      );
      return false;
    }
    // load every blob the manifest recorded (name -> buffer; a pass takes what it applies later,
    // the rest is freed after restore runs)
    const blobs = {};
    const names = manifest._blobs !== undefined ? manifest._blobs : [];
    for (let i = 0; i < names.length; i++) {
      const buf = File.readBuffer(dir + names[i] + ".bin");
      if (buf !== undefined) blobs[names[i]] = buf;
    }
    SaveGame._pending = { manifest, blobs, slot };
    return true;
  },

  /** Whether a bundle is parked for the load-branch. */
  pending() {
    return SaveGame._pending !== null;
  },

  /**
   * Reconstruct the session into a FRESH colony scene — called from sceneColony.create()'s load-branch
   * in place of the new-game map+player seeding. Runs the frame's restore passes, then frees the
   * loaded blobs no pass took (a map's grid blob is taken into its stash — see _pendingMaps).
   * Clears the pending bundle.
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

  /**
   * Stash every saved map with its grid blob (taken out of the bundle — the stash owns it now),
   * so each map's first visit restores its own state (the active map now, the rest on travel).
   * A map whose blob is missing is not stashed: its first visit builds fresh, which the log says.
   */
  _stashPending(maps, ctx) {
    SaveGame.clearPending();
    for (let i = 0; i < maps.length; i++) {
      const m = maps[i];
      const buf = ctx.takeBlob(m.blob);
      if (buf === undefined) {
        Log.error(
          "SaveGame: map '" + m.id + "' has no grid blob — it will build fresh",
        );
        continue;
      }
      SaveGame._pendingMaps[m.id] = { map: m, buf: buf };
    }
  },

  /**
   * Drop any stashed per-map state and free its blobs — a NEW game must not inherit a prior
   * load's maps, and a scene teardown must not leak the maps never visited.
   */
  clearPending() {
    const ids = Object.keys(SaveGame._pendingMaps);
    for (let i = 0; i < ids.length; i++)
      buffer_delete(SaveGame._pendingMaps[ids[i]].buf);
    SaveGame._pendingMaps = {};
  },

  /**
   * Consume a map's stashed state — { map, buf }, the caller now owning the buffer — or null when
   * none is stashed (a new game, or a map never saved). Applied once, at the map's first visit.
   */
  takePendingMap(mapId) {
    const p = SaveGame._pendingMaps[mapId];
    if (p === undefined) return null;
    delete SaveGame._pendingMaps[mapId];
    return p;
  },

  /**
   * index read-modify-write. The index is the authoritative slot list (find can't scan the save area).
   */
  _writeIndex(slot, meta) {
    const idx = SaveGame._readIndex();
    idx.slots[slot] = meta;
    const json = Json.encode(idx);
    if (json === undefined) return; // encode aborted (already Log.error'd) — keep the old index
    File.write(SaveGame.INDEX, json);
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
      const w = scene.level.entities;
      const pid = scene.playerId;
      const health = pid !== undefined ? w.get(pid, Health) : undefined;
      const stats = pid !== undefined ? w.get(pid, Stats) : undefined;
      const inv = pid !== undefined ? w.get(pid, Inventory) : undefined;
      ctx.manifest.activeMap = World.activeId;
      ctx.manifest.meta = {
        version: Snapshot.VERSION,
        savedAt: new Date().toISOString(), // clean wall-clock stamp (date_datetime_string is garbled on GMRT)
        map: World.activeId,
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

  // world-scope singletons: clock, weather, the whole progression (counters, unlocks, quests), and
  // the off-focus world — the event queue and the trader records it drives.
  _simPass: {
    id: "sim",
    capture(ctx) {
      ctx.manifest.sim = {
        clock: { hour: WorldClock.hour, day: WorldClock.day },
        weather: Weather.export(),
        tracker: Tracker.export(),
        events: WorldEvents.export(),
        traders: Trader.export(),
      };
    },
    restore(ctx) {
      const sim = ctx.manifest.sim;
      if (sim === undefined) return;
      WorldClock.hour = sim.clock.hour;
      WorldClock.day = sim.clock.day;
      Weather.import(sim.weather);
      // the progression REPLACES the session's — a load is not a merge, so whatever the previous
      // slot left in memory can't survive into this one.
      Tracker.import(sim.tracker);
      // the queue and the records before the maps: a trader embodied in the active map is in that
      // map's store, and its record re-links to it by id once the map is up (Trader.onActivate)
      WorldEvents.import(sim.events);
      Trader.import(sim.traders);
    },
  },

  /**
   * Per-map state, one entry per resident map (active or parked) — everything ColonyMap.restore
   * needs to stand the map up without its file:
   *   world        the store export whole (minus _TRANSIENT) — every entity under its index +
   *                generation; on-disk manifest key, renaming it orphans existing saves
   *   blob         the grid blob's name (map_<id>) — the tile layers, LevelGrid.pack
   *   layers       the LAYERS keys in pack order; terrainMats a generated map's palette rows, so
   *                the packed ids mean the same TileTypes on the way back (ColonyLevel.restore)
   *   cell/cols/rows/capacity   the grid's shape and the store's size
   *   statics / colliders       the scene's collider id lists (level edge + terrain / per solid
   *                layer) — ids into `world`, kept so a build-mode remesh still frees the right ones
   *   spawn / entries / reachZone / reachDone / built / builtEnts   the per-map scene fields
   *   climate      the level's whole-map sky (meta.climate); absent on an open-sky map
   *   settlement   the level's settlement record (Settlement); absent on an unsettled map
   */
  _mapsPass: {
    id: "maps",
    capture(ctx) {
      const activeId = World.activeId;
      const ids = World.ids();
      const maps = [];
      for (let m = 0; m < ids.length; m++) {
        const mapId = ids[m];
        const level = World.get(mapId); // the map's data — pooled whether it's active or parked
        // its per-map colony state lives flat on the scene while active, in the park bundle once parked
        const src = mapId === activeId ? ctx.scene : ColonyMap._parked[mapId];
        if (level === null || src === undefined) continue;
        const entities = level.entities;
        const grid = level.grid;
        // component export → JSON, minus the transient components (re-derived each tick or
        // re-minted; dropping them also shrinks the save and dodges any cyclic reference a
        // runtime component might carry — see Json's cycle guard).
        const exp = entities.export();
        for (let t = 0; t < SaveGame._TRANSIENT.length; t++)
          delete exp.components[SaveGame._TRANSIENT[t]];
        const layers = [];
        const colliders = {};
        for (let l = 0; l < contentTiles.LAYERS.length; l++) {
          const cfg = contentTiles.LAYERS[l];
          layers.push(cfg.key);
          if (cfg.solid === true)
            colliders[cfg.key] = src[cfg.key + "Colliders"];
        }
        const blob = "map_" + mapId;
        ctx.putBlob(blob, grid.pack());
        maps.push({
          id: mapId,
          indoor: src._indoor === true,
          climate: src._climate,
          settlement: src.settlement,
          cell: grid.cellWidth,
          cols: grid.cols,
          rows: grid.rows,
          capacity: entities.maxEntities,
          blob: blob,
          layers: layers,
          terrainMats: SaveGame._terrainRows(src.terrainMats),
          spawn: src.spawn,
          entries: src.entries,
          reachZone: src.reachZone,
          reachDone: src.reachDone === true,
          built: src._built !== undefined ? src._built : {},
          builtEnts: src._builtEnts !== undefined ? src._builtEnts : {},
          statics: src.statics,
          colliders: colliders,
          world: exp,
        });
      }
      ctx.manifest.maps = maps;
    },
    /**
     * Stash every saved map with its blob, then stand the ACTIVE one up through ColonyMap.restore
     * — the player is in its store, so no squad lands and nothing moves. The other maps restore
     * on their first visit (ColonyMap.go), not up front. A map that can't be restored is built
     * fresh, loudly — the only path on which a load makes anything.
     */
    restore(ctx) {
      const scene = ctx.scene;
      const manifest = ctx.manifest;
      const activeMap = manifest.activeMap;
      const maps = manifest.maps !== undefined ? manifest.maps : [];
      SaveGame._stashPending(maps, ctx);
      const pending = SaveGame.takePendingMap(activeMap);
      let restored = false;
      if (pending !== null)
        restored = ColonyMap.restore(
          scene,
          activeMap,
          "default",
          null,
          pending,
        );
      if (!restored) {
        Log.error(
          "SaveGame: active map '" +
            activeMap +
            "' could not be restored — building it fresh",
        );
        ColonyMap.build(scene, activeMap, "default", null);
      }
      if (scene.playerId === undefined)
        Log.error("SaveGame: no player in the restored map");
      Trader.onActivate(scene); // re-link (or embody) the traders settled here
      // aim the camera at the player straight away (the follow control eases in from wherever
      // the view sits — see CameraFollow.enter)
      if (scene.camera !== undefined && scene.playerId !== undefined) {
        const pos = scene.level.entities.get(scene.playerId, Position);
        if (pos !== undefined) {
          scene.camera.toX = pos.x;
          scene.camera.toY = pos.y;
        }
      }
    },
  },

  // ── helpers ──

  /**
   * A generated map's terrain material table as save rows — what its packed terrain ids mean
   * (ColonyLevel._terrainTypes rebuilds the TileTypes from these, in the same order, so id =
   * index + 1 holds). undefined on an authored map (its terrain is the one fill type).
   */
  _terrainRows(mats) {
    if (mats === undefined) return undefined;
    const rows = [];
    for (let i = 0; i < mats.length; i++)
      rows.push({
        name: mats[i].type.name,
        pathCost: mats[i].type.pathCost, // Infinity encodes as null, which TileType reads back as blocking
        sprite: mats[i].sprite,
      });
    return rows;
  },

  // ── menu UI (injected into GameOverlay as an extra tab; see Game Create_0) ──
  SLOTS: 3, // fixed named save slots shown in the menu

  /**
   * Build the Save/Load tab content — a slot list, each row a live metadata label + Save/Load.
   * Called fresh on each menu open, so the rows reflect the current index. `game` is the Game
   * object — Save reads its live scene, Load switches it.
   */
  buildMenuTab(game) {
    const scroll = gemsScroll({ grow: true });
    const sec = gemsSection(I18n.textRef("SAVE_TITLE"));
    for (let i = 1; i <= SaveGame.SLOTS; i++)
      sec.insertChild(SaveGame._slotRow(game, "slot" + i, i));
    scroll.scrollBody.insertChild(sec);
    return scroll;
  },

  _slotRow(game, slot, n) {
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
    wrap.insertChild(
      gemsLabel(() => SaveGame._slotText(slot, n), {
        color: GemsTheme.text,
      }),
    );
    row.insertChild(wrap);
    row.insertChild(
      gemsButton(
        I18n.textRef("SAVE_ACTION"),
        () => SaveGame._menuSave(game, slot, n),
        {
          width: 120,
          primary: true,
        },
      ),
    );
    row.insertChild(
      gemsButton(
        I18n.textRef("LOAD_ACTION"),
        () => SaveGame._menuLoad(game, slot, n),
        {
          width: 120,
        },
      ),
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

  /**
   * the current scene if it's saveable (has a level + player), else null — Save is gated on it.
   */
  _saveable(game) {
    const s = game.scene;
    if (
      s === null ||
      s === undefined ||
      s.level === undefined ||
      s.level === null ||
      s.playerId === undefined
    )
      return null;
    return s;
  },

  _menuSave(game, slot, n) {
    const s = SaveGame._saveable(game);
    if (s === null) {
      Toast.push(I18n.text("SAVE_TOAST_NOSCENE"));
      return;
    }
    SaveGame.save(s, slot);
    Toast.push(I18n.text("SAVE_TOAST_SAVED", n), { type: "success" });
  },

  _menuLoad(game, slot, n) {
    if (!SaveGame.has(slot)) {
      Toast.push(I18n.text("SAVE_TOAST_EMPTY", n));
      return;
    }
    if (!SaveGame.load(slot)) {
      Toast.push(I18n.text("SAVE_TOAST_LOADFAIL"), { type: "warn" });
      return;
    }
    GameOverlay.close();
    game.switchTo(SceneColony); // fresh colony boot → create() load-branch → restore
  },

  /**
   * sum of the currency item in a bag (for the metadata card).
   */
  _credits(inv) {
    let n = 0;
    const slots = inv.slots;
    for (let i = 0; i < slots.length; i++)
      if (slots[i].itemId === "coin") n += slots[i].qty;
    return n;
  },
};

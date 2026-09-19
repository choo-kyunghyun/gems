// SaveGame — the colony's disk save/load driver (Game). Composes a Snapshot (the Core pass frame)
// with the colony's capture/restore PASSES and owns the slot layout, the metadata index, and disk I/O.
/**
 * A save is the session AS IT STANDS, read off the two data homes and nothing else: the world's
 * store whole (its own entity's records — the clock, the sky, the progression, the event queue,
 * the traders) and, per resident map, its Level's two data members — its grid cell for cell and
 * its entity store whole (each entity under its saved id — the level's own entity with its
 * records, colliders, statics, builds and residents alike). No pass names a system or a field:
 * what a consumer keeps in a record rides along unlisted. A load rebuilds nothing from a seed, spawns nothing
 * and re-meshes nothing — those are a map's FIRST-visit path (ColonyMap.build); every saved map
 * is pooled back at load (ColonyMap.restoreLevel), its runtime built on its first visit, so the
 * entity set after a load is exactly the one that was saved.
 *
 * Layout (a slot is a directory — a subdir write creates it):
 *   saves/index.json         { slots: { <slot>: <meta header> } } — the load menu reads THIS
 *                            (file_find_first scans the build dir, NOT the save area, so a directory
 *                            scan can't see saves — the index is the source of truth).
 *   saves/<slot>/manifest.json   the JSON half of the hybrid bundle: metadata, the world's store,
 *                            and one entry per map — its store export and its grid's shape (see
 *                            _mapsPass).
 *   saves/<slot>/map_<id>.bin    the binary half: that map's tile layers (LevelGrid.pack).
 * Passes run in insert order both ways; capture and restore live on the same pass object so they
 * can't drift. A manifest from another Snapshot.VERSION is refused at load — no migration.
 */
globalThis.SaveGame = {
  DIR: "saves/",
  INDEX: "saves/index.json",
  _index: null, // the index as last read or written (see _readIndex)
  _frame: null, // lazily-composed Snapshot (the pass stack)
  _pending: null, // a loaded bundle awaiting the colony scene's create() load-branch, which consumes it

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
   * actual reconstruction needs a fresh scene). The caller then boots/switches to sceneColony.
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
   * loaded blobs no pass took (a map's grid blob is taken and freed by ColonyMap.restoreLevel).
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
   * index read-modify-write. The index is the authoritative slot list (find can't scan the save
   * area); it is read from disk once and held (`_index`) — the menu label reads it every frame.
   */
  _writeIndex(slot, meta) {
    const idx = SaveGame._readIndex();
    const prev = idx.slots[slot];
    idx.slots[slot] = meta;
    const json = Json.encode(idx);
    if (json === undefined) {
      // encode aborted (already Log.error'd) — keep the old index, on disk and in memory
      if (prev === undefined) delete idx.slots[slot];
      else idx.slots[slot] = prev;
      return;
    }
    File.write(SaveGame.INDEX, json);
  },
  _readIndex() {
    if (SaveGame._index === null) {
      SaveGame._index = { slots: {} };
      const raw = File.read(SaveGame.INDEX);
      if (raw !== undefined) {
        const d = Json.decode(raw);
        if (d !== undefined && d.slots !== undefined) SaveGame._index = d;
      }
    }
    return SaveGame._index;
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
        day: WorldClock.state().day,
        season: WorldClock.season().id,
        clock: WorldClock.clockText(),
        hp: health !== undefined ? Math.round(health.hp) : 0,
        maxHp: stats !== undefined ? stats.maxHp : 0,
        credits: inv !== undefined ? SaveGame._credits(inv) : 0,
      };
    },
    restore(_ctx) {}, // header is informational — nothing to apply
  },

  // the world's store whole (its own entity's records): the clock, the sky, the progression
  // (counters, unlocks, quests) and the off-focus world — the event queue and the trader records
  // it drives.
  _simPass: {
    id: "sim",
    capture(ctx) {
      ctx.manifest.sim = World.entities.export();
    },
    restore(ctx) {
      const sim = ctx.manifest.sim;
      if (sim === undefined) return;
      // the records REPLACE the session's — a load is not a merge, so whatever the previous
      // slot left in memory can't survive into this one. Before the maps: a trader embodied in
      // the active map is in that map's store, and its record re-links to it by id once the map
      // is up (Trader.onActivate).
      World.entities.import(sim);
    },
  },

  /**
   * Per-map state, one entry per resident map (active or parked) — a Level's two data members,
   * which is everything ColonyMap.restoreLevel needs to pool the map back without its file:
   *   world        the store export whole — every entity under its index + generation, the
   *                level's own entity first with its records (the map record: spawn, entries,
   *                the collider id lists, the terrain palette rows; the builds, indoor, climate,
   *                the settlement, the clocks); on-disk manifest key, renaming it orphans
   *                existing saves
   *   blob         the grid blob's name (map_<id>) — the tile layers, LevelGrid.pack
   *   layers       the LAYERS keys in pack order (ColonyLevel.restore checks the stack)
   *   cell/cols/rows/capacity   the grid's shape and the store's size
   */
  _mapsPass: {
    id: "maps",
    capture(ctx) {
      const ids = World.ids();
      const maps = [];
      for (let m = 0; m < ids.length; m++) {
        const mapId = ids[m];
        const level = World.get(mapId); // the map's data — pooled whether it's active or parked
        const entities = level.entities;
        const grid = level.grid;
        const exp = entities.export(); // a minted component stays behind (EntityStore.mint)
        const layers = [];
        for (let l = 0; l < contentTiles.LAYERS.length; l++)
          layers.push(contentTiles.LAYERS[l].key);
        const blob = "map_" + mapId;
        ctx.putBlob(blob, grid.pack());
        maps.push({
          id: mapId,
          cell: grid.cellWidth,
          cols: grid.cols,
          rows: grid.rows,
          capacity: entities.maxEntities,
          blob: blob,
          layers: layers,
          world: exp,
        });
      }
      ctx.manifest.maps = maps;
    },
    /**
     * Pool every saved map back (ColonyMap.restoreLevel — data only), then enter the ACTIVE one
     * through ColonyMap.go: the player is in its store, so no squad lands and nothing moves, and
     * its runtime is built there like any first visit. A map that can't be restored is built
     * fresh on its first visit, loudly — the only path on which a load makes anything.
     */
    restore(ctx) {
      const scene = ctx.scene;
      const manifest = ctx.manifest;
      const activeMap = manifest.activeMap;
      const maps = manifest.maps !== undefined ? manifest.maps : [];
      for (let i = 0; i < maps.length; i++) {
        const m = maps[i];
        const buf = ctx.takeBlob(m.blob);
        if (buf === undefined) {
          Log.error(
            "SaveGame: map '" + m.id + "' has no grid blob — it will build fresh",
          );
          continue;
        }
        ColonyMap.restoreLevel(m, buf);
      }
      if (World.get(activeMap) === null)
        Log.error(
          "SaveGame: active map '" +
            activeMap +
            "' could not be restored — building it fresh",
        );
      ColonyMap.go(scene, activeMap, "default");
      if (scene.playerId === undefined)
        Log.error("SaveGame: no player in the restored map");
      // aim the camera entity's look-at at the player straight away (the follow policy eases
      // in from wherever the look-at sits — CameraSystem)
      if (scene.playerId !== undefined) {
        const entities = scene.level.entities;
        const pos = entities.get(scene.playerId, Position);
        const cid = entities.first(Camera);
        if (pos !== undefined) {
          if (cid !== -1) {
            const cp = entities.require(cid, Position);
            cp.x = pos.x;
            cp.y = pos.y;
          }
        }
      }
    },
  },

  // ── helpers ──

  // ── menu UI (injected into GameOverlay as an extra tab; see Game Create_0) ──
  SLOTS: 3, // fixed named save slots shown in the menu

  /**
   * Build the Save/Load tab content — a slot list, each row a live metadata label + Save/Load.
   * Called fresh on each menu open, so the rows reflect the current index. `game` is the Game
   * object — Save reads its live scene, Load switches it.
   */
  buildMenuTab(game) {
    const scroll = facetScroll({ grow: true });
    const sec = facetSection(I18n.textRef("SAVE_TITLE"));
    for (let i = 1; i <= SaveGame.SLOTS; i++)
      sec.insertChild(SaveGame._slotRow(game, "slot" + i, i));
    scroll.scrollBody.insertChild(sec);
    return scroll;
  },

  _slotRow(game, slot, n) {
    const row = new UIElement({
      width: "100%",
      height: FacetTheme.rowH,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    // live label (function ref re-reads the index each frame → updates in place after a save)
    const wrap = new UIElement({
      flexGrow: 1,
      height: "100%",
      justifyContent: "center",
    });
    wrap.insertChild(
      facetLabel(() => SaveGame._slotText(slot, n), {
        color: FacetTheme.text,
      }),
    );
    row.insertChild(wrap);
    row.insertChild(
      facetButton(
        I18n.textRef("SAVE_ACTION"),
        () => SaveGame._menuSave(game, slot, n),
        {
          width: 120,
          primary: true,
        },
      ),
    );
    row.insertChild(
      facetButton(
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
    game.switchTo(sceneColony); // fresh colony boot → create() load-branch → restore
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

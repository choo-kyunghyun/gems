/**
 * The colony's disk save/load driver. A save is the session as it stands: the world's store whole
 * and each resident map's entity store whole, every entity under its saved id; nothing names a
 * system or a field, and binary codec entries cross as named blobs. A load rebuilds, spawns and
 * re-meshes nothing — every saved map is pooled back as data and gets its runtime on its first
 * visit — so the entity set after a load is exactly the one saved.
 *
 * A slot is a directory holding a JSON manifest plus its blobs; `saves/index.json` is the source of
 * truth for the slot list, since a directory scan can't see the save area. A manifest from another
 * VERSION is refused — no migration.
 */
globalThis.SaveGame = {
  VERSION: 24, // bump when the manifest/blob layout changes incompatibly
  DIR: "saves/",
  INDEX: "saves/index.json",
  _index: null,
  _pending: null, // a loaded bundle awaiting restore on a fresh scene

  /** `slot` is a bare name, which becomes a directory. */
  save(scene, slot) {
    const t0 = current_time;
    const dir = SaveGame.DIR + slot + "/";
    // recording each blob's name keeps load self-describing
    const blobs = [];
    const sink = (name, buffer) => {
      File.writeBytes(dir + name + ".bin", buffer);
      buffer_delete(buffer);
      blobs.push(name);
      return name;
    };
    const manifest = {
      version: SaveGame.VERSION,
      activeMap: scene.level.id,
      meta: SaveGame._meta(scene),
      world: scene.world.table.export((token, index, buffer) =>
        sink("world." + token + "." + index, buffer),
      ),
      maps: SaveGame._maps(scene.world, sink),
      _blobs: blobs,
    };
    const json = Json.encode(manifest);
    if (json === undefined) {
      Log.error("SaveGame: manifest encode aborted — '" + slot + "' not saved");
      return false;
    }
    File.write(dir + "manifest.json", json);
    SaveGame._writeIndex(slot, manifest.meta);
    Log.info(
      "SaveGame: saved '" +
        slot +
        "' — " +
        manifest.maps.length +
        " map(s), " +
        blobs.length +
        " blob(s) in " +
        (current_time - t0) +
        "ms",
    );
    return true;
  },


  /** slot -> meta header. */
  list() {
    return SaveGame._readIndex().slots;
  },

  has(slot) {
    return SaveGame._readIndex().slots[slot] !== undefined;
  },

  /**
   * Parks a slot's bundle until restore, which needs a fresh scene. False if the slot can't be
   * read.
   */
  load(slot) {
    const dir = SaveGame.DIR + slot + "/";
    const raw = File.read(dir + "manifest.json");
    if (raw === undefined) {
      Log.error("SaveGame: no manifest for slot '" + slot + "'");
      return false;
    }
    const manifest = Json.decode(raw);
    if (manifest === undefined) {
      Log.error("SaveGame: manifest for '" + slot + "' is corrupt");
      return false;
    }
    if (manifest.version !== SaveGame.VERSION) {
      Log.error(
        "SaveGame: slot '" +
          slot +
          "' is save version " +
          manifest.version +
          ", this build reads " +
          SaveGame.VERSION,
      );
      return false;
    }
    const blobs = {};
    const names = manifest._blobs !== undefined ? manifest._blobs : [];
    for (let i = 0; i < names.length; i++) {
      const buf = File.readBytes(dir + names[i] + ".bin");
      if (buf !== undefined) blobs[names[i]] = buf;
    }
    SaveGame._pending = { manifest, blobs, slot };
    return true;
  },

  pending() {
    return SaveGame._pending !== null;
  },

  /**
   * Reconstructs the parked bundle into a fresh scene, in place of new-game seeding, and frees its
   * blobs. Every saved map comes back pooled and none active: returns the id of the map the save
   * was made on, for the caller to enter; undefined with nothing parked.
   */
  restore(scene) {
    const p = SaveGame._pending;
    if (p === null) return undefined;
    SaveGame._pending = null;
    const manifest = p.manifest;
    const world = scene.world;
    // a load is not a merge: nothing the previous slot left in memory survives. Records that name
    // a map's entity re-link by id once that map is up.
    if (manifest.world !== undefined) world.table.import(manifest.world, (name) => p.blobs[name]);
    const maps = manifest.maps !== undefined ? manifest.maps : [];
    for (let m = 0; m < maps.length; m++)
      ColonyMap.restoreLevel(world, maps[m], (name) => p.blobs[name]);
    if (world.get(manifest.activeMap) === null)
      Log.error(
        "SaveGame: active map '" + manifest.activeMap + "' could not be restored — building it fresh",
      );
    const names = Object.keys(p.blobs);
    for (let i = 0; i < names.length; i++) buffer_delete(p.blobs[names[i]]);
    Log.info("SaveGame: restored slot '" + p.slot + "'");
    return p.manifest.activeMap;
  },

  /** The index is read from disk once and held: the menu reads it every frame. */
  _writeIndex(slot, meta) {
    const idx = SaveGame._readIndex();
    const prev = idx.slots[slot];
    idx.slots[slot] = meta;
    const json = Json.encode(idx);
    if (json === undefined) {
      // keep the old index, on disk and in memory.
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

  /** The at-a-glance card the load menu shows; never applied on restore. */
  _meta(scene) {
    const w = scene.level.entities;
    const pid = scene.playerId;
    const health = pid !== undefined ? w.get(pid, Health) : undefined;
    const stats = pid !== undefined ? w.get(pid, Stats) : undefined;
    const inv = pid !== undefined ? w.get(pid, Inventory) : undefined;
    return {
      version: SaveGame.VERSION,
      savedAt: new Date().toISOString(), // date_datetime_string is garbled (docs/GMRT.md)
      map: scene.level.id,
      day: WorldClock.state().day,
      season: Season.now().id,
      clock: WorldClock.clockText(),
      hp: health !== undefined ? Math.round(health.hp) : 0,
      maxHp: stats !== undefined ? stats.maxHp : 0,
      credits: inv !== undefined ? SaveGame._credits(inv) : 0,
    };
  },

  /**
   * One entry per resident map, active or parked: its level's store export, enough to pool the
   * map back without its file. `level` is an on-disk manifest key; renaming it orphans existing
   * saves.
   */
  _maps(world, sink) {
    const ids = world.ids();
    const maps = [];
    for (let m = 0; m < ids.length; m++) {
      const mapId = ids[m];
      const entities = world.get(mapId).entities;
      const exp = entities.export((token, index, buffer) =>
        sink(mapId + "." + token + "." + index, buffer),
      );
      maps.push({ id: mapId, capacity: entities.maxEntities, level: exp });
    }
    return maps;
  },

  SLOTS: 3,

  /** `game` owns the live scene: Save reads it, Load switches it. */
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
    // the label re-reads the index each frame, so it updates in place after a save.
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

  /** The current scene if it has a level and a player, else null. */
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
    game.switchTo(sceneColony); // a fresh scene restores the parked bundle
  },

  _credits(inv) {
    let n = 0;
    const slots = inv.slots;
    for (let i = 0; i < slots.length; i++)
      if (slots[i].itemId === "coin") n += slots[i].qty;
    return n;
  },
};

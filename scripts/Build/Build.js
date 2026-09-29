/**
 * Player construction on a level: placing and deconstructing catalog items — a palette entry paid
 * in the build resource, a prop paid with the Placeable item it is set down from — and founding a
 * settlement over a map. A level builds when its Settlement's owner is FACTION or an ally; an
 * unsettled level is founded through claim(). Every paid verb takes the level and the acting body,
 * whose Inventory pays and is refunded, and a refusal comes back as an i18n key for the caller to
 * show.
 *
 * The build record under KEY — the player-built tiles and entities by "gx,gy", the
 * deconstructable set — is seeded blank on first use and saved with the level.
 */
globalThis.Build = {
  KEY: "build", // a data key: a save holds it
  RESOURCE: "plank",
  FACTION: "player",
  // DEV free build: no gate, no cost, no refund — structures built to be captured, not paid for.
  // Session-wide, so it outlives any one map.
  free: false,
  _lost: [], // reap's collector

  of(level) {
    return level.entities.of(level.self, Build.KEY, () => ({ built: {}, builtEnts: {} }));
  },

  /** Whether the level's settlement is owned by FACTION or an ally. */
  allied(level) {
    const owner = Settlement.owner(level);
    return owner !== undefined && Diplomacy.isAlly(owner, Build.FACTION);
  },

  /** Can `item` stand at (gx, gy), cost aside — the per-cell test a shape runs. */
  fits(level, actorId, item, gx, gy) {
    const grid = level.grid;
    if (!Build.free && !Build.allied(level)) return false;
    const rt = ColonyMap.runtime(level);
    const lkeys = contentBuild.tileLayers();
    for (let i = 0; i < lkeys.length; i++)
      if (rt[lkeys[i] + "Layer"].occupied(gx, gy)) return false;
    if (Build.of(level).builtEnts[gx + "," + gy] !== undefined) return false;
    // a crop only where its species can root
    if (item.species !== undefined) {
      if (!Flora.canRoot(level, contentFlora.get(item.species), gx, gy))
        return false;
    }
    // a solid item never lands on the actor's own cell
    const solid = !(
      item.kind === "tile" && contentTiles.get(item.layer).solid !== true
    );
    if (solid) {
      const pp = level.entities.require(actorId, Position);
      const pc = grid.worldToGrid(pp.x, pp.y);
      if (pc.x === gx && pc.y === gy) return false;
    }
    return true;
  },

  /** fits plus the cost of one palette placement. */
  canPlace(level, actorId, item, gx, gy) {
    if (!Build.fits(level, actorId, item, gx, gy)) return false;
    if (Build.free) return true;
    const inv = level.entities.require(actorId, Inventory);
    return Bag.has(inv, Build.RESOURCE, item.cost);
  },

  /**
   * One build over the `[gx, gy]` cells `item` fits: the whole cost is paid up front or nothing
   * is placed — half a wall is worse than none. Returns
   * `{ placed, cost, reason }`, `reason` "" or the refusal's i18n key.
   */
  place(level, actorId, item, cells) {
    const todo = [];
    for (let i = 0; i < cells.length; i++)
      if (Build.fits(level, actorId, item, cells[i][0], cells[i][1]))
        todo.push(cells[i]);
    if (todo.length === 0) return { placed: 0, cost: 0, reason: "" };
    const cost = todo.length * item.cost;
    if (!Build.free) {
      const inv = level.entities.require(actorId, Inventory);
      if (!Bag.has(inv, Build.RESOURCE, cost))
        return { placed: 0, cost: cost, reason: "BUILD_NO_WOOD" };
      Bag.remove(inv, Build.RESOURCE, cost);
    }
    for (let i = 0; i < todo.length; i++) Build.put(level, todo[i][0], todo[i][1], item);
    Log.info(`built ${todo.length}x ${item.id}`);
    return { placed: todo.length, cost: cost, reason: "" };
  },

  /**
   * Set one `itemId` from the actor's bag down at (gx, gy) as its Placeable's catalog entry,
   * spending the unit. "" when placed, else the refusal's i18n key.
   */
  install(level, actorId, itemId, gx, gy) {
    const it = Item.get(itemId);
    const pc = it !== undefined ? it.getComponent(Placeable) : undefined;
    if (pc === undefined) return "INV_NOT_USABLE";
    const entry = contentBuild.item(pc.build);
    if (!Build.fits(level, actorId, entry, gx, gy)) return "BUILD_BLOCKED";
    if (!Build.free) {
      const inv = level.entities.require(actorId, Inventory);
      if (Bag.remove(inv, itemId, 1) < 1) return "INV_NOT_OWNED";
    }
    Build.put(level, gx, gy, entry);
    Log.info(`installed ${itemId} at ${gx},${gy}`);
    return "";
  },

  /**
   * Deconstruct what the player built on each `[gx, gy]` cell, refunding the actor; a refund the
   * bag can't hold drops on the cell. Returns the number of cells cleared.
   */
  remove(level, actorId, cells) {
    let n = 0;
    for (let i = 0; i < cells.length; i++)
      if (Build._remove(level, actorId, cells[i][0], cells[i][1])) n++;
    return n;
  },

  /**
   * The spawn descriptor for an entity item at a cell: the item's `spawn` fields over the build
   * defaults. An `orient` item turns vertical between walls above and below, the run it closes.
   */
  descriptor(level, item, gx, gy) {
    const s = { preset: "prop", gx, gy, label: I18n.text(item.labelKey) };
    const spawn = item.spawn;
    for (const k in spawn) s[k] = spawn[k];
    if (item.orient === true) {
      const wall = ColonyMap.runtime(level).wallLayer;
      s.vertical = wall.occupied(gx, gy - 1) && wall.occupied(gx, gy + 1);
    }
    return s;
  },

  // The placement core: no cost or validity gate, no inventory — the caller decides. Records the
  // cell in the build record.
  //   opts.record  restore this captured row instead of a fresh descriptor, moved to the cell.
  // Returns the entity id for an entity, else undefined.
  put(level, gx, gy, item, opts = {}) {
    const grid = level.grid;
    const key = gx + "," + gy;
    const rec = Build.of(level);
    if (item.kind === "tile") {
      // `mat` picks a per-cell material type
      const rt = ColonyMap.runtime(level);
      const layer = rt[item.layer + "Layer"];
      const type =
        item.mat !== undefined
          ? rt[item.layer + "Types"][item.mat]
          : rt[item.layer + "Type"];
      layer.set(gx, gy, type);
      Grassland.cut(level, gx, gy);
      rec.built[key] = item.id;
      return;
    }
    // a built entity is an ordinary one: it persists like any other
    let id;
    if (opts.record !== undefined) {
      const wp = grid.gridToWorld(gx, gy);
      id = level.entities.restore(opts.record, {
        [Position]: { x: wp.x, y: wp.y, z: 0 },
      });
    } else {
      id = ColonySpawn.spawnEntity(
        level.entities,
        grid,
        Build.descriptor(level, item, gx, gy),
      );
    }
    rec.builtEnts[key] = { ent: id, itemId: item.id };
    Grassland.cut(level, gx, gy);
    return id;
  },

  /** Deconstruct what the player built at (gx, gy); returns whether anything was removed. */
  _remove(level, actorId, gx, gy) {
    const key = gx + "," + gy;
    const entities = level.entities;
    const rec = Build.of(level);
    // an entity sits on top of a tile, so it goes first
    const ent = rec.builtEnts[key];
    if (ent !== undefined) {
      if (entities.isValid(ent.ent)) {
        // spill the contents first, else removing the entity deletes them
        Loot.spill(entities, ent.ent);
        entities.remove(ent.ent);
      }
      Build._refund(level, actorId, ent.itemId, gx, gy);
      delete rec.builtEnts[key];
      Log.info(`removed ${ent.itemId} at ${gx},${gy}`);
      return true;
    }
    const tileId = rec.built[key];
    if (tileId === undefined) return false; // only player-built cells are deconstructable
    const item = contentBuild.item(tileId);
    const lkey = item !== undefined ? item.layer : "floor"; // a stale id clears the floor
    ColonyMap.runtime(level)[lkey + "Layer"].clear(gx, gy);
    Build._refund(level, actorId, tileId, gx, gy);
    delete rec.built[key];
    Log.info(`removed ${tileId} at ${gx},${gy}`);
    return true;
  },

  /** A prop returns the item it is set down from, a palette entry its cost. */
  _refund(level, actorId, buildId, gx, gy) {
    if (Build.free) return; // nothing was paid
    let itemId = Build._source(buildId);
    let qty = 1;
    if (itemId === undefined) {
      const item = contentBuild.item(buildId);
      if (item === undefined || item.cost === undefined) return;
      itemId = Build.RESOURCE;
      qty = item.cost;
    }
    const entities = level.entities;
    const left = Bag.add(entities.require(actorId, Inventory), itemId, qty);
    if (left > 0) {
      const wp = level.grid.gridToWorld(gx, gy);
      Loot.drop(entities, itemId, left, wp.x, wp.y);
    }
  },

  /** The Placeable item that sets `buildId` down, or undefined for a palette entry. */
  _source(buildId) {
    const all = Item.all();
    for (let i = 0; i < all.length; i++) {
      const pc = all[i].getComponent(Placeable);
      if (pc !== undefined && pc.build === buildId) return all[i].id;
    }
    return undefined;
  },

  /**
   * Per frame: drop built entities destroyed in combat from the build record, freeing the cell
   * and keeping a dead handle out of the save. No refund. Returns the destroyed item ids in a
   * buffer reused by the next call.
   */
  reap(level) {
    const lost = Build._lost;
    let w = 0;
    const entities = level.entities;
    const builtEnts = Build.of(level).builtEnts;
    const keys = Object.keys(builtEnts);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const e = builtEnts[k];
      if (!entities.isValid(e.ent)) {
        delete builtEnts[k];
        continue;
      }
      const hp = entities.get(e.ent, Health);
      if (hp !== undefined && hp.hp <= 0) {
        entities.remove(e.ent);
        delete builtEnts[k];
        lost[w++] = e.itemId;
        Log.info(`built ${e.itemId} destroyed at ${k}`);
      }
    }
    lost.length = w;
    return lost;
  },

  /**
   * Found FACTION's settlement over the level at a survey post, keeping the map from then on,
   * then spend the post — also on an already-settled level, so it never re-founds. Returns
   * whether a settlement was founded.
   */
  claim(level, postId) {
    const s = Settlement.found(level, {
      name: I18n.text("SETTLEMENT_DEFAULT_NAME"),
      factionId: Build.FACTION,
    });
    if (s !== undefined) {
      ColonyMap.persist(level);
      Log.info(`founded settlement over ${level.id}`);
    }
    level.entities.detach(postId, Interaction);
    return s !== undefined;
  },
};

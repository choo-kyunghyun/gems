/**
 * Player construction on a level: placing and deconstructing catalog items — a palette entry paid
 * in the build resource, a prop paid with the Placeable item it is set down from — and founding a
 * settlement over a map. A level builds when its Settlement's owner is FACTION or an ally; an
 * unsettled level is founded through claim(). Every paid verb takes the level and the acting body,
 * whose Inventory pays and is refunded, and a refusal comes back as an i18n key for the caller to
 * show.
 *
 * What a level holds of the catalog is read off the map itself, whoever set it down: an entity
 * stands as its entry through its Structure, a tile as the entry painting its layer and material.
 * On a level that builds, all of it deconstructs for a refund.
 */
globalThis.Build = {
  RESOURCE: "plank",
  FACTION: "player",
  // DEV free build: no gate, no cost, no refund — structures built to be captured, not paid for.
  // Session-wide, so it outlives any one map.
  free: false,

  /** Whether the level's settlement is owned by FACTION or an ally. */
  allied(level) {
    const owner = Settlement.owner(level);
    return owner !== undefined && Diplomacy.isAlly(owner, Build.FACTION);
  },

  /** Can `item` stand at (gx, gy), cost aside — the per-cell test a shape runs. */
  fits(level, item, gx, gy) {
    const grid = level.grid;
    if (!Build.free && !Build.allied(level)) return false;
    const lkeys = contentBuild.tileLayers();
    for (let i = 0; i < lkeys.length; i++)
      if (grid.layer(lkeys[i]).occupied(gx, gy)) return false;
    if (Build.at(level, gx, gy) !== -1) return false;
    // a crop only where its species can root
    if (item.species !== undefined) {
      if (!Flora.canRoot(level, contentFlora.get(item.species), gx, gy))
        return false;
    }
    // a solid item never lands on a solid body, the builder's own included; inset a pixel so a
    // neighbour touching the cell's edge stays clear
    const solid = !(
      item.kind === "tile" && contentTiles.get(item.layer).solid !== true
    );
    if (solid) {
      const x1 = gx * grid.cellWidth + 1;
      const y1 = gy * grid.cellHeight + 1;
      const x2 = x1 + grid.cellWidth - 2;
      const y2 = y1 + grid.cellHeight - 2;
      if (Query.maskRect(level.entities, x1, y1, x2, y2).length > 0) return false;
    }
    return true;
  },

  /** fits plus the cost of one palette placement. */
  canPlace(level, actorId, item, gx, gy) {
    if (!Build.fits(level, item, gx, gy)) return false;
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
      if (Build.fits(level, item, cells[i][0], cells[i][1]))
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
    if (!Build.fits(level, entry, gx, gy)) return "BUILD_BLOCKED";
    if (!Build.free) {
      const inv = level.entities.require(actorId, Inventory);
      if (Bag.remove(inv, itemId, 1) < 1) return "INV_NOT_OWNED";
    }
    Build.put(level, gx, gy, entry);
    Log.info(`installed ${itemId} at ${gx},${gy}`);
    return "";
  },

  /**
   * Deconstruct the catalog entry on each `[gx, gy]` cell of a level that builds, refunding the
   * actor; a refund the bag can't hold drops on the cell. Returns the number of cells cleared.
   */
  remove(level, actorId, cells) {
    if (!Build.free && !Build.allied(level)) return 0;
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
    const s = { preset: "prop", gx, gy, label: I18n.text(item.labelKey), item: item.id };
    const spawn = item.spawn;
    for (const k in spawn) s[k] = spawn[k];
    if (item.orient === true) {
      const wall = level.grid.layer("wall");
      s.vertical = wall.occupied(gx, gy - 1) && wall.occupied(gx, gy + 1);
    }
    return s;
  },

  // The placement core: no cost or validity gate, no inventory — the caller decides.
  //   opts.record  restore this captured row instead of a fresh descriptor, moved to the cell.
  // Returns the entity id for an entity, else undefined.
  put(level, gx, gy, item, opts = {}) {
    const grid = level.grid;
    if (item.kind === "tile") {
      // `mat` picks a per-cell material type
      const layer = grid.layer(item.layer);
      layer.set(gx, gy, layer.type(item.mat));
      Grassland.cut(level, gx, gy);
      return;
    }
    // a built entity is an ordinary one: it persists like any other
    let id;
    if (opts.record !== undefined) {
      const wp = grid.gridToWorld(gx, gy);
      id = level.entities.restore(opts.record, {
        [Position]: { x: wp.x, y: wp.y, z: 0 },
        [Structure]: { item: item.id },
      });
    } else {
      id = ColonySpawn.spawnEntity(
        level.entities,
        grid,
        Build.descriptor(level, item, gx, gy),
      );
      // what the player builds, the player may re-arm
      const eq = level.entities.get(id, Equipment);
      if (eq !== undefined) eq.protected = false;
    }
    Grassland.cut(level, gx, gy);
    return id;
  },

  /** The Structure standing on (gx, gy), or -1. */
  at(level, gx, gy) {
    const cw = level.grid.cellWidth;
    const ch = level.grid.cellHeight;
    let found = -1;
    level.entities.forEach([Structure, Position], (id, _st, pos) => {
      if (found !== -1) return; // forEach has no break
      if (Math.floor(pos.x / cw) === gx && Math.floor(pos.y / ch) === gy) found = id;
    });
    return found;
  },

  /** Whether remove() would clear anything at (gx, gy), the level's gate aside. */
  removable(level, gx, gy) {
    if (Build.at(level, gx, gy) !== -1) return true;
    return Build._tile(level, gx, gy) !== undefined;
  },

  /**
   * The catalog entry painting the topmost build layer at (gx, gy); undefined on bare ground or
   * under a tile no entry paints.
   */
  _tile(level, gx, gy) {
    const lkeys = contentBuild.tileLayers();
    const layers = level.grid.layers;
    for (let l = layers.length - 1; l >= 0; l--) {
      const layer = layers[l];
      if (lkeys.indexOf(layer.key) === -1) continue;
      const type = layer.get(gx, gy);
      if (!type) continue;
      return contentBuild.tileItem(layer.key, type.key === "" ? undefined : type.key);
    }
    return undefined;
  },

  /** Deconstruct the catalog entry at (gx, gy); returns whether anything was removed. */
  _remove(level, actorId, gx, gy) {
    const entities = level.entities;
    // an entity sits on top of a tile, so it goes first
    const id = Build.at(level, gx, gy);
    if (id !== -1) {
      const itemId = entities.require(id, Structure).item;
      // spill the contents first, else removing the entity deletes them
      Loot.spill(entities, id);
      entities.remove(id);
      Build._refund(level, actorId, itemId, gx, gy);
      Log.info(`removed ${itemId} at ${gx},${gy}`);
      return true;
    }
    const item = Build._tile(level, gx, gy);
    if (item === undefined) return false;
    level.grid.layer(item.layer).clear(gx, gy);
    Build._refund(level, actorId, item.id, gx, gy);
    Log.info(`removed ${item.id} at ${gx},${gy}`);
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
   * Found FACTION's settlement over the level at a survey post, keeping the map from then on; the
   * post stands on as the settlement's centre. On an already-settled level the post is spent
   * instead, so it never re-founds. Returns whether a settlement was founded.
   */
  claim(level, postId) {
    const s = Settlement.found(level, {
      name: I18n.text("SETTLEMENT_DEFAULT_NAME"),
      factionId: Build.FACTION,
    });
    if (s === undefined) {
      level.entities.detach(postId, Interaction);
      return false;
    }
    level.entities.require(postId, Interaction).kind = "settlement";
    ColonyMap.persist(level);
    Log.info(`founded settlement over ${level.id}`);
    return true;
  },
};

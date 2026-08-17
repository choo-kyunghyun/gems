/**
 * Gated to a PLAYER-OWNED Settlement (a Zone in the "settlement" ZoneMap channel, owner faction
 * "player") — founded by pressing E at a Survey Post (Interactable routes to BuildMode.claim →
 * Settlement.found). Build mode only OPENS while the player stands in an owned settlement, and
 * placement is gated cell-by-cell to owned land. The palette (a bottom-center gemsCatBar) item is a
 * TILE (TileLayer via TileEdit) or an ENTITY (via RpgSpawn.spawnEntity); LMB places at the hovered
 * cell, RMB deconstructs. State on the scene (`_build*`); the static `active` flag is mirrored each
 * frame so drawWorld can gate the cursor highlight to "build context owns input".
 *
 * scene contract (create()/RpgMap.build): entities, playerId, grid, ui, a <key>Layer/<key>Type per
 * RpgGrid.LAYERS entry (+ wallTypes: material key → TileType), colliders (the wall layer's),
 * _tilePasses (render pass per layer key).
 */
globalThis.BuildMode = {
  active: false, // mirror of (scene._buildActive && build context), read by drawWorld
  RESOURCE: "wood",
  OWNER: "player", // the Settlement owner faction id that gates building (Game policy)

  // build catalog driving the gemsCatBar. kind "tile" edits a TileLayer via TileEdit; kind "entity"
  // spawns via make()'s RpgSpawn.spawnEntity descriptor. `cost` = wood per placement. `id` is the
  // token persisted in _built / _builtEnts + the map cache, so it MUST be unique across the catalog.
  CATALOG: [
    {
      // tile items: `layer` names the RpgGrid.LAYERS key (scene[layer+"Layer"]/[layer+"Type"]);
      // a wall item's `mat` picks the per-cell material TileType (scene.wallTypes[mat]).
      labelKey: "BUILD_CAT_TILES",
      items: [
        {
          id: "wall",
          labelKey: "BUILD_WALL",
          cost: 1,
          kind: "tile",
          layer: "wall",
          mat: "brick",
        },
        {
          id: "wall_concrete",
          labelKey: "BUILD_WALL_CONCRETE",
          cost: 2,
          kind: "tile",
          layer: "wall",
          mat: "concrete",
        },
        {
          id: "wall_metal",
          labelKey: "BUILD_WALL_METAL",
          cost: 3,
          kind: "tile",
          layer: "wall",
          mat: "metal",
        },
        {
          id: "wall_plank",
          labelKey: "BUILD_WALL_PLANK",
          cost: 1,
          kind: "tile",
          layer: "wall",
          mat: "plank",
        },
        {
          id: "floor",
          labelKey: "BUILD_FLOOR",
          cost: 1,
          kind: "tile",
          layer: "floor",
        },
        {
          id: "floor_tile",
          labelKey: "BUILD_FLOOR_TILE",
          cost: 1,
          kind: "tile",
          layer: "floorTile",
        },
        {
          id: "floor_carpet",
          labelKey: "BUILD_FLOOR_CARPET",
          cost: 2,
          kind: "tile",
          layer: "floorCarpet",
        },
        {
          id: "floor_mosaic",
          labelKey: "BUILD_FLOOR_MOSAIC",
          cost: 2,
          kind: "tile",
          layer: "floorMosaic",
        },
      ],
    },
    {
      labelKey: "BUILD_CAT_FURNITURE",
      items: [
        {
          id: "crate",
          labelKey: "BUILD_CRATE",
          cost: 2,
          kind: "entity",
          /** furn sub-type picks the vox mesh (RpgSpawn prop branch, wooden_crate). */
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_CRATE"),
            furn: "crate",
          }),
        },
        {
          id: "barrel",
          labelKey: "BUILD_BARREL",
          cost: 2,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_BARREL"),
            furn: "barrel",
          }),
        },
        {
          id: "fence",
          labelKey: "BUILD_FENCE",
          cost: 1,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_FENCE"),
            furn: "fence",
          }),
        },
        {
          // openable door (wooden_door slab; the "door" InteractAction toggles Collision.solid).
          // auto-oriented at placement: walls above+below → a vertical door in a N-S wall run
          // (make's optional 3rd arg is the scene — only this item reads it).
          id: "door",
          labelKey: "BUILD_DOOR",
          cost: 4,
          kind: "entity",
          make: (gx, gy, scene) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_DOOR"),
            kind: "door",
            vertical:
              scene !== undefined &&
              TileEdit.occupied(scene.wallLayer, gx, gy - 1) &&
              TileEdit.occupied(scene.wallLayer, gx, gy + 1),
          }),
        },
        {
          // bed Interaction (kind "bed") — the "bed" InteractAction routes E to scene._sleep (fast-forward + drain Drowsiness).
          id: "bed",
          labelKey: "BUILD_BED",
          cost: 6,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_BED"),
            color: "#b06a4f",
            kind: "bed",
          }),
        },
        {
          // cheaper cot: the same "bed" sleep Interaction, the prison_bed bunk mesh (furn "cot")
          id: "cot",
          labelKey: "BUILD_COT",
          cost: 4,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_COT"),
            kind: "bed",
            furn: "cot",
          }),
        },
        // decorative furniture — plain solid props over the spare vox models (RpgSpawn.FURN_MODELS);
        // colliders come from the voxel-content footprint (RpgSpawn.footprint), no per-item wiring
        {
          id: "table",
          labelKey: "BUILD_TABLE",
          cost: 4,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_TABLE"),
            furn: "table",
          }),
        },
        {
          id: "table_coffee",
          labelKey: "BUILD_TABLE_COFFEE",
          cost: 3,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_TABLE_COFFEE"),
            furn: "table_coffee",
          }),
        },
        {
          id: "table_small",
          labelKey: "BUILD_TABLE_SMALL",
          cost: 3,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_TABLE_SMALL"),
            furn: "table_small",
          }),
        },
        {
          id: "dresser",
          labelKey: "BUILD_DRESSER",
          cost: 5,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_DRESSER"),
            furn: "dresser",
          }),
        },
        {
          id: "dresser_double",
          labelKey: "BUILD_DRESSER_DOUBLE",
          cost: 7,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_DRESSER_DOUBLE"),
            furn: "dresser_double",
          }),
        },
        {
          id: "stool",
          labelKey: "BUILD_STOOL",
          cost: 1,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_STOOL"),
            furn: "stool",
          }),
        },
        {
          id: "stool_round",
          labelKey: "BUILD_STOOL_ROUND",
          cost: 1,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_STOOL_ROUND"),
            furn: "stool_round",
          }),
        },
        {
          id: "nightstand",
          labelKey: "BUILD_NIGHTSTAND",
          cost: 2,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_NIGHTSTAND"),
            furn: "nightstand",
          }),
        },
      ],
    },
    {
      labelKey: "BUILD_CAT_LIGHTING",
      items: [
        {
          id: "torch",
          labelKey: "BUILD_TORCH",
          cost: 3,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "torch",
            gx,
            gy,
            label: I18n.text("BUILD_TORCH"),
            color: "#ff9a3c",
          }),
        },
        {
          // standing lantern — steadier, wider, whiter light than the torch (lantern preset)
          id: "lantern",
          labelKey: "BUILD_LANTERN",
          cost: 5,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "lantern",
            gx,
            gy,
            label: I18n.text("BUILD_LANTERN"),
          }),
        },
      ],
    },
    {
      labelKey: "BUILD_CAT_STATIONS",
      items: [
        {
          id: "chest",
          labelKey: "BUILD_CHEST",
          cost: 5,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "chest",
            gx,
            gy,
            capacity: 12,
            items: [],
          }),
        },
        {
          id: "workbench",
          labelKey: "BUILD_WORKBENCH",
          cost: 8,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_WORKBENCH"),
            color: "#6b8caa",
            kind: "workbench",
          }),
        },
      ],
    },
    {
      labelKey: "BUILD_CAT_DEFENSE",
      items: [
        {
          id: "turret",
          labelKey: "BUILD_TURRET",
          cost: 10,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "turret",
            gx,
            gy,
            label: I18n.text("BUILD_TURRET"),
          }),
        },
      ],
    },
    {
      // survival stations — vox-mesh props (tub/bin/alter) carrying an Interaction whose
      // InteractAction acts on the player (hydrate/feed/buff). Same prop pattern as
      // bed/workbench; the action is data (RpgInteractions).
      labelKey: "BUILD_CAT_SURVIVAL",
      items: [
        {
          id: "watertank",
          labelKey: "BUILD_WATERTANK",
          cost: 4,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_WATERTANK"),
            kind: "hydrate",
          }),
        },
        {
          id: "rationbox",
          labelKey: "BUILD_RATIONBOX",
          cost: 4,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_RATIONBOX"),
            kind: "feed",
          }),
        },
        {
          id: "shrine",
          labelKey: "BUILD_SHRINE",
          cost: 12,
          kind: "entity",
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_SHRINE"),
            kind: "buff",
          }),
        },
      ],
    },
  ],
  CLAIM_HALF_W: 3, // claimed rect half-extent in cells (so 7×5 around the post)
  CLAIM_HALF_H: 2,

  /**
   * resolve a catalog item by id (turns a persisted _built / _builtEnts entry back into its layer/cost).
   */
  item(id) {
    for (let c = 0; c < BuildMode.CATALOG.length; c++) {
      const items = BuildMode.CATALOG[c].items;
      for (let i = 0; i < items.length; i++)
        if (items[i].id === id) return items[i];
    }
    return undefined;
  },

  /** build the HUD + init per-scene state. call once from create(). */
  build(scene) {
    // Player builds are SCENE-tracked, never chunk-managed (like the squad): a streamed chunk
    // unloading must not take the player's wall with it. They persist across map changes by
    // construction — a visited map is parked whole in the pool, not rebuilt from file.
    scene._built = {}; // "gx,gy" -> tile item id (wall/floor): deconstructable tiles
    scene._builtEnts = {}; // "gx,gy" -> { ent, itemId }: deconstructable built entities
    scene._buildActive = false;
    scene._buildItem = BuildMode.CATALOG[0].items[0]; // selected catalog item (default Wall)
    scene._buildCell = undefined; // last hovered cell, for drawWorld
    BuildMode.active = false;

    // bottom-center HUD: status line over the build bar. placement (LMB/RMB) is on the world
    // grid, guarded against the HUD's own rect (_overHud) so clicking the bar can't also edit behind it.
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 18,
      alignItems: "center",
    });
    const col = new UIElement({
      width: 760,
      gap: GemsTheme.gapSm,
      alignItems: "center",
    });

    const statusRow = new UIElement({ width: "100%", height: 22 });
    statusRow.insertChild(
      gemsLabel(() => BuildMode._statusText(scene), {
        halign: fa_center,
        color: GemsTheme.text,
      }),
    );
    col.insertChild(statusRow);

    // map the catalog to gemsCatBar's shape; each item's onSelect sets the active brush.
    const cats = [];
    for (let c = 0; c < BuildMode.CATALOG.length; c++) {
      const cat = BuildMode.CATALOG[c];
      const items = [];
      for (let i = 0; i < cat.items.length; i++) {
        const it = cat.items[i];
        items.push({
          label: () => I18n.text(it.labelKey) + "  (" + it.cost + ")",
          onSelect: () => {
            scene._buildItem = it;
          },
        });
      }
      cats.push({ label: I18n.textRef(cat.labelKey), items });
    }
    const bar = gemsCatBar(cats, { width: 760, selCat: 0, selItem: 0 });
    col.insertChild(bar);
    scene._buildBar = bar;

    wrap.insertChild(col);
    wrap.enabled = false;
    scene._buildHud = wrap;
    scene._buildHudBox = col; // rect for the placement guard
    scene.ui.insertChild(wrap);
  },

  _statusText(scene) {
    const inv = scene.entities.get(Inventory, scene.playerId);
    const wood =
      inv !== undefined ? InventorySystem.count(inv, BuildMode.RESOURCE) : 0;
    const it = scene._buildItem;
    return I18n.text("BUILD_STATUS", wood, I18n.text(it.labelKey), it.cost);
  },

  /**
   * per-frame: toggle on B, then (while active + not over the HUD) place on LMB / deconstruct on
   * RMB at the hovered cell. call from step() after Interactable.update, outside the tick loop.
   */
  update(scene) {
    // B toggles build mode, but it only OPENS while the player stands on land they OWN (a
    // player-owned Settlement) — "you can only build in your own settlement". Closing is free.
    if (Input.get("build").pressed()) {
      if (scene._buildActive) scene._buildActive = false;
      else if (BuildMode._playerOwnsHere(scene)) scene._buildActive = true;
      else Toast.push(I18n.text("BUILD_NEED_SETTLEMENT"), { type: "info" });
    }
    // active only when toggled on AND the build context owns input — an open window makes the
    // context "window" (priority over build), so building pauses and window clicks can't place/remove.
    const on = scene._buildActive === true && InputContext.is("build");
    BuildMode.active = on;
    scene._buildHud.enabled = on;
    if (!on) {
      scene._buildBar.catbar.close(); // collapse any open flyout when leaving build mode
      return;
    }

    const grid = scene.grid;

    // skip world edits while the cursor is over the build HUD (a bar click must not place behind it).
    if (BuildMode._overHud(scene)) {
      scene._buildCell = undefined;
      return;
    }

    // scene-latched world cursor (pitch-aware) — mouse_x/mouse_y are wrong under the pitched camera
    const cell = grid.worldToGrid(scene.mouseWorld.x, scene.mouseWorld.y);
    scene._buildCell = cell;
    if (cell.x < 0 || cell.y < 0 || cell.x >= grid.cols || cell.y >= grid.rows)
      return;

    // reuse the LMB edge latched by UIPointer.poll (the poll-once rule — UIPointer). RMB is unread elsewhere, single query safe.
    if (UIPointer.pressed) BuildMode._tryPlace(scene, cell.x, cell.y);
    else if (mouse_check_button_pressed(mb_right))
      BuildMode._tryRemove(scene, cell.x, cell.y);
  },

  /**
   * cursor over the HUD column's rect (`width > 0` dodges the first-frame NaN rect; the column
   * grows to include an open flyout, so this covers it).
   */
  _overHud(scene) {
    const p = scene._buildHudBox.getLayoutPosition();
    if (!(p.width > 0)) return false;
    const gmx = device_mouse_x_to_gui(0);
    const gmy = device_mouse_y_to_gui(0);
    return (
      gmx >= p.x && gmx <= p.x + p.width && gmy >= p.y && gmy <= p.y + p.height
    );
  },

  // the distinct layer keys the catalog's tile items edit (derived once) — the cell-occupancy
  // check spans them all, so one built thing per cell across every wall/floor variant.
  _tileLayerKeys: null,
  tileLayerKeys() {
    if (BuildMode._tileLayerKeys !== null) return BuildMode._tileLayerKeys;
    const keys = [];
    for (let c = 0; c < BuildMode.CATALOG.length; c++) {
      const items = BuildMode.CATALOG[c].items;
      for (let i = 0; i < items.length; i++)
        if (items[i].kind === "tile" && keys.indexOf(items[i].layer) === -1)
          keys.push(items[i].layer);
    }
    BuildMode._tileLayerKeys = keys;
    return keys;
  },

  /** does the player currently stand on land of a settlement they OWN? gates opening build mode. */
  _playerOwnsHere(scene) {
    const pp = scene.entities.get(Position, scene.playerId);
    if (pp === undefined) return false;
    const c = scene.grid.worldToGrid(pp.x, pp.y);
    return Settlement.ownerAt(scene.grid, c.x, c.y) === BuildMode.OWNER;
  },

  /**
   * can the selected item be placed at (gx, gy): on land of a settlement the player OWNS, cell empty
   * (across every buildable tile layer), enough wood, and a SOLID item (a wall / any entity — not a
   * floor) isn't on the player's own cell. shared by place + cursor highlight.
   */
  _canBuild(scene, gx, gy) {
    const grid = scene.grid;
    if (Settlement.ownerAt(grid, gx, gy) !== BuildMode.OWNER) return false;
    const lkeys = BuildMode.tileLayerKeys();
    for (let i = 0; i < lkeys.length; i++)
      if (TileEdit.occupied(scene[lkeys[i] + "Layer"], gx, gy)) return false;
    if (scene._builtEnts[gx + "," + gy] !== undefined) return false;
    const item = scene._buildItem;
    const inv = scene.entities.get(Inventory, scene.playerId);
    if (
      inv === undefined ||
      !InventorySystem.has(inv, BuildMode.RESOURCE, item.cost)
    )
      return false;
    const solid = !(
      item.kind === "tile" && RpgGrid.layerCfg(item.layer).solid !== true
    );
    if (solid) {
      const pp = scene.entities.get(Position, scene.playerId);
      if (pp !== undefined) {
        const pc = grid.worldToGrid(pp.x, pp.y);
        if (pc.x === gx && pc.y === gy) return false;
      }
    }
    return true;
  },

  _tryPlace(scene, gx, gy) {
    if (!BuildMode._canBuild(scene, gx, gy)) return;
    const item = scene._buildItem;
    const inv = scene.entities.get(Inventory, scene.playerId);
    InventorySystem.remove(inv, BuildMode.RESOURCE, item.cost);
    BuildMode.applyItem(scene, gx, gy, item); // immediate remesh (deferRemesh unset)
    scene._invDirty = true;
    Log.info(`built ${item.id} at ${gx},${gy}`);
  },

  // Place a resolved catalog `item` at a cell — the SHARED placement core of live LMB placement,
  // Blueprint.stamp, and save-restore. It does NOT gate on cost/validity (the caller decides) or
  // touch inventory. Options:
  //   opts.snapshot    restore an EXACT entity from an EntitySnapshot (chest contents, turret
  //                    damage) instead of a fresh make(); Position is overridden to this cell.
  //   opts.deferRemesh skip the solid-collider remesh (a batch stamp remeshes once at the end).
  // Updates _built / _builtEnts. Returns the entity id (entity) or whether a solid tile was placed
  // (so a deferred caller knows a wall remesh is pending).
  applyItem(scene, gx, gy, item, opts = {}) {
    const grid = scene.grid;
    const key = gx + "," + gy;
    if (item.kind === "tile") {
      // resolve layer/type by the item's LAYERS key; `mat` picks a material TileType (per-cell
      // wall materials). Only the solid layer (wall) has colliders to remesh (scene.colliders).
      const layer = scene[item.layer + "Layer"];
      const type =
        item.mat !== undefined
          ? scene[item.layer + "Types"][item.mat]
          : scene[item.layer + "Type"];
      TileEdit.set(layer, gx, gy, type);
      const solid = RpgGrid.layerCfg(item.layer).solid === true;
      if (solid && opts.deferRemesh !== true)
        TileEdit.remesh(scene.entities, grid, layer, scene.colliders);
      BuildMode._markTileDirty(scene, item.layer);
      scene._built[key] = item.id;
      return solid;
    }
    // entity: an exact snapshot restore (state preserved) or a fresh make() (a new instance).
    // make's optional 3rd arg is the scene (the door auto-orients off the wall layer); a built
    // prop is identical to a file/streamed one and persists via EntitySnapshot (see RpgMap).
    let id;
    if (opts.snapshot !== undefined) {
      const wp = grid.gridToWorld(gx, gy);
      id = EntitySnapshot.restore(scene.entities, opts.snapshot, {
        [Position]: { x: wp.x, y: wp.y, z: 0 },
      });
    } else {
      id = RpgSpawn.spawnEntity(scene.entities, grid, item.make(gx, gy, scene));
    }
    scene._builtEnts[key] = { ent: id, itemId: item.id };
    return id;
  },

  _tryRemove(scene, gx, gy) {
    const key = gx + "," + gy;
    const grid = scene.grid;
    // built entities sit on top of tiles — remove one first if present.
    const ent = scene._builtEnts[key];
    if (ent !== undefined) {
      // a slotted module isn't in any inventory, so return it to the bag or deconstruct deletes it.
      if (scene.entities.isValid(ent.ent)) {
        const st = scene.entities.get(Interaction, ent.ent);
        if (st !== undefined && st.module !== undefined && st.module !== "") {
          const inv = scene.entities.get(Inventory, scene.playerId);
          if (inv !== undefined) InventorySystem.add(inv, st.module, 1);
        }
        // spill the entity's Inventory as drops first, else entities.remove silently deletes the
        // contents. no-op without an Inventory; preserves instance uid/mods on the drop.
        RpgCombat.spillLoot(scene, ent.ent);
        scene.entities.remove(ent.ent);
      }
      BuildMode._refund(scene, ent.itemId);
      delete scene._builtEnts[key];
      scene._invDirty = true;
      Log.info(`removed ${ent.itemId} at ${gx},${gy}`);
      return;
    }
    const tileId = scene._built[key];
    if (tileId === undefined) return; // only player-built cells are deconstructable
    const item = BuildMode.item(tileId);
    const lkey = item !== undefined ? item.layer : "floor"; // stale id → floor (non-solid, safe)
    TileEdit.clear(scene[lkey + "Layer"], gx, gy);
    if (RpgGrid.layerCfg(lkey).solid === true)
      TileEdit.remesh(
        scene.entities,
        grid,
        scene[lkey + "Layer"],
        scene.colliders,
      );
    BuildMode._markTileDirty(scene, lkey);
    BuildMode._refund(scene, tileId);
    delete scene._built[key];
    scene._invDirty = true;
    Log.info(`removed ${tileId} at ${gx},${gy}`);
  },

  /**
   * RenderTileMap passes are VBO-cached, so a tile edit must markDirty the layer's pass to render
   * (autotiling rebuilds the whole VBO, restyling neighbors). guarded: absent if its sprite failed sprite_exists.
   */
  _markTileDirty(scene, layerKey) {
    const pass = scene._tilePasses[layerKey];
    if (pass !== undefined) pass.markDirty();
  },

  _refund(scene, itemId) {
    const item = BuildMode.item(itemId);
    const inv = scene.entities.get(Inventory, scene.playerId);
    if (item !== undefined && inv !== undefined)
      InventorySystem.add(inv, BuildMode.RESOURCE, item.cost);
  },

  /**
   * sweep built entities destroyed in combat (a turret brought to 0 HP) out of the deconstruct
   * tracking, so the cell frees + persistence won't snapshot a dead handle. NO wood refund (destroyed,
   * not deconstructed). called every frame from step. keys via Object.keys + index loop (no Map iteration — GMRT-safe).
   */
  reapDestroyed(scene) {
    const entities = scene.entities;
    const keys = Object.keys(scene._builtEnts);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const e = scene._builtEnts[k];
      if (!entities.isValid(e.ent)) {
        delete scene._builtEnts[k]; // already gone (removed elsewhere)
        continue;
      }
      const hp = entities.get(Health, e.ent);
      if (hp !== undefined && hp.hp <= 0) {
        entities.remove(e.ent);
        delete scene._builtEnts[k];
        const item = BuildMode.item(e.itemId);
        const label = item !== undefined ? I18n.text(item.labelKey) : e.itemId;
        Toast.push(I18n.text("BUILT_DESTROYED", label), { type: "warn" });
        Log.info(`built ${e.itemId} destroyed at ${k}`);
      }
    }
  },

  /**
   * Found the player's settlement around a Survey Post: a player-owned Settlement zone over a rect,
   * then *spend* the post (detach its Interaction). The founded settlement is the stored state
   * (round-trips persistence via the "settlement" channel), so a post re-spawned over already-settled
   * land is still spent — no re-founding.
   */
  claim(scene, postId) {
    const grid = scene.grid;
    const pos = scene.entities.get(Position, postId);
    if (pos === undefined) return;
    const c = grid.worldToGrid(pos.x, pos.y);
    if (Settlement.at(grid, c.x, c.y) === undefined) {
      const x1 = Math.max(0, c.x - BuildMode.CLAIM_HALF_W);
      const y1 = Math.max(0, c.y - BuildMode.CLAIM_HALF_H);
      const x2 = Math.min(grid.cols - 1, c.x + BuildMode.CLAIM_HALF_W);
      const y2 = Math.min(grid.rows - 1, c.y + BuildMode.CLAIM_HALF_H);
      Settlement.found(grid, x1, y1, x2, y2, {
        name: I18n.text("SETTLEMENT_DEFAULT_NAME"),
        factionId: BuildMode.OWNER,
        color: "#55aa55",
      });
      Toast.push(I18n.text("SETTLEMENT_FOUNDED"), { type: "success" });
      Log.info(`founded settlement (${x1},${y1})-(${x2},${y2})`);
    }
    scene.entities.detach(postId, Interaction); // spent — stop prompting / block re-founding
  },

  /**
   * world-space cursor highlight: green = placeable, yellow = deconstructable, red = invalid.
   * call from scene.draw().
   */
  drawWorld(scene) {
    if (!BuildMode.active) return;
    const cell = scene._buildCell;
    if (cell === undefined) return;
    const grid = scene.grid;
    if (cell.x < 0 || cell.y < 0 || cell.x >= grid.cols || cell.y >= grid.rows)
      return;

    const key = cell.x + "," + cell.y;
    const wx = cell.x * grid.cellWidth;
    const wy = cell.y * grid.cellHeight;
    let col;
    if (scene._built[key] !== undefined || scene._builtEnts[key] !== undefined)
      col = c_yellow;
    else col = BuildMode._canBuild(scene, cell.x, cell.y) ? c_lime : c_red;

    draw_set_color(col);
    draw_set_alpha(0.3);
    draw_rectangle(wx, wy, wx + grid.cellWidth, wy + grid.cellHeight, false);
    draw_set_alpha(1);
    draw_rectangle(wx, wy, wx + grid.cellWidth, wy + grid.cellHeight, true);
    draw_set_color(c_white);
  },
};

// Grid build mode for the RPG scene (mirrors the Interactable module shape): a toggleable
// mode that consumes wood to place content from a CATEGORIZED palette, and refunds wood on
// deconstruct. Building is gated to a *claimed* buildable zone (the "buildable" ZoneMap
// channel) — the player claims an area by pressing E at a Claim Post station (Interactable
// routes that to BuildMode.claim).
//
// Palette: a bottom-center HUD bar (gemsCatBar) of categories whose flyouts hold the items.
// An item is either a TILE (wall/floor — edits a TileLayer via TileEdit) or an ENTITY
// (furniture/station — spawned via RpgSpawn.spawnEntity, deconstructable + persisted). The
// active item is scene._buildItem; LMB places it on the hovered grid cell, RMB deconstructs.
//
// All per-scene state lives on the SCENE (namespaced `_build*`); BuildMode is a stateless
// singleton like Interactable. The one exception is the static `active` flag, mirrored each
// frame so drawWorld can gate the world-space cursor highlight to "build context owns input".
//
// Scene contract (set in create()/RpgMap.build): world, ctrl.id, level, ui, wallLayer, floorLayer,
// colliders, wallType, floorType, buildZoneId, _tilePasses (RenderTileMap pass per layer key).
globalThis.BuildMode = {
  active: false, // mirror of (scene._buildActive && build context), read by drawWorld
  RESOURCE: "wood",

  // Build catalog — categories of placeable items driving the gemsCatBar. kind "tile" edits a
  // TileLayer (wall/floor) via TileEdit; kind "entity" spawns a prop/chest entity (make()
  // returns its RpgSpawn.spawnEntity descriptor). `cost` is wood per placement (refunded on
  // deconstruct). `id` is the stable token persisted in scene._built / scene._builtEnts (and
  // the map cache), so it MUST be unique across the whole catalog.
  CATALOG: [
    {
      labelKey: "BUILD_CAT_TILES",
      items: [
        {
          id: "wall",
          labelKey: "BUILD_WALL",
          cost: 1,
          kind: "tile",
          layer: "wall",
        },
        {
          id: "floor",
          labelKey: "BUILD_FLOOR",
          cost: 1,
          kind: "tile",
          layer: "floor",
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
          make: (gx, gy) => ({
            preset: "prop",
            gx,
            gy,
            label: I18n.text("BUILD_CRATE"),
            color: "#9c6b3c",
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
            color: "#7a5230",
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
            color: "#8a6a45",
          }),
        },
        {
          // A bed is an interactable Station (kind "bed") — Interactable routes E to scene._sleep
          // (fast-forwards Time.scale + drains Drowsiness). Built like any furniture/station entity.
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
  ],
  CLAIM_HALF_W: 3, // claimed rect half-extent in cells (so 7×5 around the post)
  CLAIM_HALF_H: 2,

  // Resolve a catalog item by its id — used to turn a persisted _built / _builtEnts entry back
  // into its layer/cost on deconstruct + restore.
  item(id) {
    for (let c = 0; c < BuildMode.CATALOG.length; c++) {
      const items = BuildMode.CATALOG[c].items;
      for (let i = 0; i < items.length; i++)
        if (items[i].id === id) return items[i];
    }
    return undefined;
  },

  // Build the toggled build-mode HUD and init per-scene state. Call once from create().
  build(scene) {
    scene._built = {}; // "gx,gy" -> tile item id (wall/floor): deconstructable tiles
    scene._builtEnts = {}; // "gx,gy" -> { ent, itemId }: deconstructable built entities
    scene._buildActive = false;
    scene._buildItem = BuildMode.CATALOG[0].items[0]; // selected catalog item (default Wall)
    scene._buildCell = undefined; // last hovered cell, for drawWorld
    BuildMode.active = false;

    // Bottom-center HUD: a status line over the categorized build bar. The bar selects the
    // active item; placement is on the world grid (LMB/RMB), guarded against the HUD's own
    // rect (_overHud) so clicking the bar doesn't also edit the cell behind it.
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

    // Map the catalog to gemsCatBar's shape; each item's onSelect sets the active brush.
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
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const wood =
      inv !== undefined ? InventorySystem.count(inv, BuildMode.RESOURCE) : 0;
    const it = scene._buildItem;
    return I18n.text("BUILD_STATUS", wood, I18n.text(it.labelKey), it.cost);
  },

  // Per-frame: toggle on B, mirror state, then (while active and not over the HUD) place on the
  // LMB edge / deconstruct on RMB at the hovered cell. Call from step() after Interactable.update,
  // outside the tick loop.
  update(scene) {
    if (Input.get("build").pressed()) scene._buildActive = !scene._buildActive;
    // Active only when build mode is toggled on AND the build context owns input. A gameplay
    // window open this frame makes the context "window" (priority over build), so building
    // pauses (and clicks on the window can't place/remove); it resumes when the window closes.
    const on = scene._buildActive === true && InputContext.is("build");
    BuildMode.active = on;
    scene._buildHud.enabled = on;
    if (!on) {
      scene._buildBar.catbar.close(); // collapse any open flyout when leaving build mode
      return;
    }

    const level = scene.level;

    // Skip world edits while the cursor is over the build HUD (clicking the bar must not also
    // place behind it — the bar's own clicks are handled by UI.update). Also blanks the cursor.
    if (BuildMode._overHud(scene)) {
      scene._buildCell = undefined;
      return;
    }

    const cell = level.worldToGrid(mouse_x, mouse_y);
    scene._buildCell = cell;
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= level.cols ||
      cell.y >= level.rows
    )
      return;

    // LMB edge is the one already latched by UIPointer.poll this frame — reuse it rather than
    // re-querying mouse_check_button_pressed(mb_left) (realtime sampling returns different
    // values per call; see GMRT-Safe Idioms). RMB is unread elsewhere, so a single query is safe.
    if (UIPointer.pressed) BuildMode._tryPlace(scene, cell.x, cell.y);
    else if (mouse_check_button_pressed(mb_right))
      BuildMode._tryRemove(scene, cell.x, cell.y);
  },

  // True when the GUI-space cursor is over the HUD column's laid-out rect (`width > 0` dodges
  // the first-frame NaN rect). The column grows to include an open flyout, so this covers it.
  _overHud(scene) {
    const p = scene._buildHudBox.getLayoutPosition();
    if (!(p.width > 0)) return false;
    const gmx = device_mouse_x_to_gui(0);
    const gmy = device_mouse_y_to_gui(0);
    return (
      gmx >= p.x && gmx <= p.x + p.width && gmy >= p.y && gmy <= p.y + p.height
    );
  },

  // True when the selected item can be placed at (gx, gy): inside the claimed buildable zone,
  // the cell is empty (no tile, no built entity), enough wood, and a SOLID item (wall tile or
  // any prop/station — not a floor) isn't on the cell the player stands on. Shared by the place
  // action and the cursor highlight.
  _canBuild(scene, gx, gy) {
    const level = scene.level;
    const zmap = level.zoneMap("buildable");
    if (zmap === undefined || zmap.idAt(gx, gy) === 0) return false;
    if (TileEdit.occupied(scene.wallLayer, gx, gy)) return false;
    if (TileEdit.occupied(scene.floorLayer, gx, gy)) return false;
    if (scene._builtEnts[gx + "," + gy] !== undefined) return false;
    const item = scene._buildItem;
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    if (
      inv === undefined ||
      !InventorySystem.has(inv, BuildMode.RESOURCE, item.cost)
    )
      return false;
    const solid = !(item.kind === "tile" && item.layer === "floor");
    if (solid) {
      const pp = scene.world.get(Position, scene.ctrl.id);
      if (pp !== undefined) {
        const pc = level.worldToGrid(pp.x, pp.y);
        if (pc.x === gx && pc.y === gy) return false;
      }
    }
    return true;
  },

  _tryPlace(scene, gx, gy) {
    if (!BuildMode._canBuild(scene, gx, gy)) return;
    const item = scene._buildItem;
    const level = scene.level;
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    InventorySystem.remove(inv, BuildMode.RESOURCE, item.cost);
    const key = gx + "," + gy;
    if (item.kind === "tile") {
      const layer = item.layer === "wall" ? scene.wallLayer : scene.floorLayer;
      const type = item.layer === "wall" ? scene.wallType : scene.floorType;
      TileEdit.set(level, layer, gx, gy, type);
      if (item.layer === "wall")
        TileEdit.remesh(scene.world, level, scene.wallLayer, scene.colliders);
      BuildMode._markTileDirty(scene, item.layer);
      scene._built[key] = item.id;
    } else {
      // Spawn through the shared per-entity constructor so a built prop/station is identical
      // to a file/streamed one (and persists via EntitySnapshot, see RpgMap).
      const id = RpgSpawn.spawnEntity(scene.world, level, item.make(gx, gy));
      scene._builtEnts[key] = { ent: id, itemId: item.id };
    }
    scene._invDirty = true;
    Log.info(`built ${item.id} at ${gx},${gy}`);
  },

  _tryRemove(scene, gx, gy) {
    const key = gx + "," + gy;
    const level = scene.level;
    // Built entities sit on top of tiles — remove one first if present.
    const ent = scene._builtEnts[key];
    if (ent !== undefined) {
      // A workbench with a module slotted (Station.module) returns that module to the bag — it
      // isn't in any inventory while slotted, so deconstructing would otherwise delete it.
      if (scene.world.isValid(ent.ent)) {
        const st = scene.world.get(Station, ent.ent);
        if (st !== undefined && st.module !== undefined && st.module !== "") {
          const inv = scene.world.get(Inventory, scene.ctrl.id);
          if (inv !== undefined) InventorySystem.add(inv, st.module, 1);
        }
        scene.world.remove(ent.ent);
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
    if (item !== undefined && item.layer === "wall") {
      TileEdit.clear(level, scene.wallLayer, gx, gy);
      TileEdit.remesh(scene.world, level, scene.wallLayer, scene.colliders);
      BuildMode._markTileDirty(scene, "wall");
    } else {
      TileEdit.clear(level, scene.floorLayer, gx, gy);
      BuildMode._markTileDirty(scene, "floor");
    }
    BuildMode._refund(scene, tileId);
    delete scene._built[key];
    scene._invDirty = true;
    Log.info(`removed ${tileId} at ${gx},${gy}`);
  },

  // The RenderTileMap passes are VBO-cached, so a tile edit must markDirty the matching layer's
  // pass for the change to render (autotiling rebuilds the whole layer VBO, so neighbors restyle
  // too). Guarded: a pass is absent only if its sprite failed sprite_exists in RpgMap.
  _markTileDirty(scene, layerKey) {
    const pass = scene._tilePasses[layerKey];
    if (pass !== undefined) pass.markDirty();
  },

  _refund(scene, itemId) {
    const item = BuildMode.item(itemId);
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    if (item !== undefined && inv !== undefined)
      InventorySystem.add(inv, BuildMode.RESOURCE, item.cost);
  },

  // Sweep built entities DESTROYED in combat (a turret slimes brought to 0 HP, or any built
  // entity removed from the world): drop them from the deconstruct tracking so the cell frees
  // up and map persistence won't snapshot a dead handle. NO wood refund — it was destroyed, not
  // deconstructed. Called every frame from the scene's step (combat applies damage in the tick
  // loop). Plain-object keys walked via Object.keys + index loop (no Map iteration — GMRT-safe).
  reapDestroyed(scene) {
    const world = scene.world;
    const keys = Object.keys(scene._builtEnts);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const e = scene._builtEnts[k];
      if (!world.isValid(e.ent)) {
        delete scene._builtEnts[k]; // already gone (removed elsewhere)
        continue;
      }
      const hp = world.get(Health, e.ent);
      if (hp !== undefined && hp.hp <= 0) {
        world.remove(e.ent);
        delete scene._builtEnts[k];
        const item = BuildMode.item(e.itemId);
        const label = item !== undefined ? I18n.text(item.labelKey) : e.itemId;
        Toast.push(I18n.text("BUILT_DESTROYED", label), { type: "warn" });
        Log.info(`built ${e.itemId} destroyed at ${k}`);
      }
    }
  },

  // Claim the buildable area around a Claim Post (Station kind "claim"). Paints a fixed rect
  // into the "buildable" zone channel, then *spends* the post: its Station is detached so
  // Interactable stops prompting and the area can't be re-claimed. The painted zone is the
  // stored state (it round-trips through map persistence), so a post re-spawned over an
  // already-claimed area skips the paint/toast but is still spent — no infinite re-claiming.
  claim(scene, postId) {
    const level = scene.level;
    const pos = scene.world.get(Position, postId);
    if (pos === undefined) return;
    const zmap = level.zoneMap("buildable");
    if (zmap === undefined) return;
    const c = level.worldToGrid(pos.x, pos.y);
    if (zmap.idAt(c.x, c.y) === 0) {
      const x1 = Math.max(0, c.x - BuildMode.CLAIM_HALF_W);
      const y1 = Math.max(0, c.y - BuildMode.CLAIM_HALF_H);
      const x2 = Math.min(level.cols - 1, c.x + BuildMode.CLAIM_HALF_W);
      const y2 = Math.min(level.rows - 1, c.y + BuildMode.CLAIM_HALF_H);
      zmap.paintRect(scene.buildZoneId, x1, y1, x2, y2);
      Toast.push(I18n.text("BUILD_CLAIMED"), { type: "success" });
      Log.info(`claimed build area (${x1},${y1})-(${x2},${y2})`);
    }
    scene.world.detach(postId, Station); // spent — stop prompting / block re-claim
  },

  // World-space cursor highlight over the snapped hovered cell — green = placeable,
  // yellow = deconstructable (player-built tile or entity), red = invalid. Call from scene.draw().
  drawWorld(scene) {
    if (!BuildMode.active) return;
    const cell = scene._buildCell;
    if (cell === undefined) return;
    const level = scene.level;
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= level.cols ||
      cell.y >= level.rows
    )
      return;

    const key = cell.x + "," + cell.y;
    const wx = cell.x * level.cellWidth;
    const wy = cell.y * level.cellHeight;
    let col;
    if (scene._built[key] !== undefined || scene._builtEnts[key] !== undefined)
      col = c_yellow;
    else col = BuildMode._canBuild(scene, cell.x, cell.y) ? c_lime : c_red;

    draw_set_color(col);
    draw_set_alpha(0.3);
    draw_rectangle(wx, wy, wx + level.cellWidth, wy + level.cellHeight, false);
    draw_set_alpha(1);
    draw_rectangle(wx, wy, wx + level.cellWidth, wy + level.cellHeight, true);
    draw_set_color(c_white);
  },
};

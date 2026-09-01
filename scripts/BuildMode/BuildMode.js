/**
 * Gated to an ALLIED Settlement — the level's (a settlement is a whole map), owned by the player's
 * faction or an ally of it (FactionSystem.isAlly). An unsettled level is founded by pressing E at a
 * Survey Post (Interactable routes to BuildMode.claim → Settlement.found). Build mode only OPENS
 * on an allied map, and placement is gated to it too. The palette (a bottom-center facetCatBar) item is a
 * TILE (TileLayer via TileEdit) or an ENTITY (via ColonySpawn.spawnEntity); LMB places, RMB
 * deconstructs. The SHAPE row above the bar sets the brush's footprint: `cell` acts on the hovered
 * cell at once, `rect`/`frame`/`line` drag from a press to a release and act on every cell the
 * shape spans as ONE build (the whole cost paid up front, solid layers remeshed once); an entity
 * item is always single-cell. State on the scene (`_build*`); the static `active` flag is mirrored
 * each frame so drawWorld can gate the cursor highlight to "build context owns input".
 *
 * DEV authoring: F6 toggles FREE build (no settlement gate, no wood) and the shape row gains
 * `capture` — drag a rect and Blueprint.capture writes what stands there out as the prefab literal
 * contentPrefabs takes (the scratch site is the canvas for it — contentSites).
 *
 * scene contract (create()/ColonyMap.build): entities, playerId, grid, ui, a <key>Layer/<key>Type per
 * contentTiles.LAYERS entry (+ wallTypes: material key → TileType), <key>Colliders per solid
 * layer, _tilePasses (render pass per layer key).
 */
globalThis.BuildMode = {
  active: false, // mirror of (scene._buildActive && build context), read by drawWorld
  // DEV free build (F6): no settlement gate, no wood, no refund — the authoring mode, where a
  // structure is built to be captured (Blueprint), not paid for. Never reachable in release.
  free: false,
  // the brush shapes, in the shape row's order; `dev` rows only show in DEV_MODE
  SHAPES: [
    { id: "cell", labelKey: "BUILD_SHAPE_CELL" },
    { id: "rect", labelKey: "BUILD_SHAPE_RECT" },
    { id: "frame", labelKey: "BUILD_SHAPE_FRAME" },
    { id: "line", labelKey: "BUILD_SHAPE_LINE" },
    { id: "capture", labelKey: "BUILD_SHAPE_CAPTURE", dev: true },
  ],
  RESOURCE: "wood",
  // the player's faction: a map builds when its Settlement's owner is it or an ally (Game policy)
  FACTION: "player",

  // build catalog driving the facetCatBar. kind "tile" edits a TileLayer via TileEdit; kind "entity"
  // spawns via make()'s ColonySpawn.spawnEntity descriptor. `cost` = wood per placement. `id` is the
  // token persisted in _built / _builtEnts + the map cache, so it MUST be unique across the catalog.
  // `species` marks a crop (a contentFlora id): its ground gates the cell (_cellFree).
  CATALOG: [
    {
      // tile items: `layer` names the contentTiles.LAYERS key (scene[layer+"Layer"]/[layer+"Type"]);
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
          // the fence layer — solid like a wall (own colliders + nav block), drawn by RenderFence
          // as post-and-rail boxes joined to their 4-neighbors. The id predates the tile form: a
          // blueprint's built-entity record carrying it lands as this tile (Blueprint.stamp).
          id: "fence",
          labelKey: "BUILD_FENCE",
          cost: 1,
          kind: "tile",
          layer: "fence",
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
          /** furn sub-type picks the vox mesh (ColonySpawn prop branch, wooden_crate). */
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
        // decorative furniture — plain solid props over the spare vox models (ColonySpawn.FURN_MODELS);
        // colliders come from the voxel-content footprint (ColonySpawn.footprint), no per-item wiring
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
      // bed/workbench; the action is data (contentInteractions).
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
    {
      // crops — a `plant` species (contentFlora) put down as a seedling; FloraSystem grows it and
      // serves its harvest. Rooted only where the species' ground allows (_cellFree).
      labelKey: "BUILD_CAT_FARMING",
      items: [
        {
          id: "wheat",
          labelKey: "BUILD_WHEAT",
          cost: 1,
          kind: "entity",
          species: "wheat",
          make: (gx, gy) => ({
            preset: "plant",
            gx,
            gy,
            species: "wheat",
            progress: 0,
          }),
        },
        {
          id: "berry_bush",
          labelKey: "BUILD_BERRY_BUSH",
          cost: 2,
          kind: "entity",
          species: "berry_bush",
          make: (gx, gy) => ({
            preset: "plant",
            gx,
            gy,
            species: "berry_bush",
            progress: 0,
          }),
        },
      ],
    },
  ],

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
    // Player builds are SCENE-tracked, apart from the level's own geometry: the tables say which
    // cells are deconstructable (and what to refund). They persist across map changes by
    // construction — a visited map is parked whole in the pool, not rebuilt — and a save keeps
    // them beside the grid and store they index (the ids stay valid: a restore keeps every id).
    scene._built = {}; // "gx,gy" -> tile item id (wall/floor): deconstructable tiles
    scene._builtEnts = {}; // "gx,gy" -> { ent, itemId }: deconstructable built entities
    scene._buildActive = false;
    scene._buildItem = BuildMode.CATALOG[0].items[0]; // selected catalog item (default Wall)
    scene._buildCell = undefined; // last hovered cell, for drawWorld
    scene._buildShape = "cell"; // the brush footprint (SHAPES id)
    scene._buildDrag = undefined; // { x, y, remove } — the anchor cell while a shape drag is held
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
      gap: FacetTheme.gapSm,
      alignItems: "center",
    });

    // shape row: one button per brush footprint (the DEV capture tool among them in DEV_MODE).
    // Topmost — the catbar's open flyout reaches up over the row right above the bar, which
    // stays the status line as before.
    const shapeRow = new UIElement({
      width: "100%",
      height: 30,
      flexDirection: "row",
      justifyContent: "center",
      gap: FacetTheme.gapSm,
    });
    for (let i = 0; i < BuildMode.SHAPES.length; i++) {
      const sh = BuildMode.SHAPES[i];
      if (sh.dev === true && !DEV_MODE) continue;
      shapeRow.insertChild(
        facetButton(
          I18n.textRef(sh.labelKey),
          () => {
            scene._buildShape = sh.id;
            scene._buildDrag = undefined;
          },
          { width: 110, height: 28 },
        ),
      );
    }
    col.insertChild(shapeRow);

    const statusRow = new UIElement({ width: "100%", height: 22 });
    statusRow.insertChild(
      facetLabel(() => BuildMode._statusText(scene), {
        halign: fa_center,
        color: FacetTheme.text,
      }),
    );
    col.insertChild(statusRow);

    // map the catalog to facetCatBar's shape; each item's onSelect sets the active brush.
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
    const bar = facetCatBar(cats, { width: 760, selCat: 0, selItem: 0 });
    col.insertChild(bar);
    scene._buildBar = bar;

    wrap.insertChild(col);
    wrap.enabled = false;
    scene._buildHud = wrap;
    scene._buildHudBox = col; // rect for the placement guard
    scene.ui.insertChild(wrap);
  },

  _statusText(scene) {
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    const wood =
      inv !== undefined ? InventorySystem.count(inv, BuildMode.RESOURCE) : 0;
    const it = scene._buildItem;
    const text = I18n.text(
      "BUILD_STATUS",
      wood,
      I18n.text(it.labelKey),
      it.cost,
      I18n.text(BuildMode._shape(scene._buildShape).labelKey),
    );
    return BuildMode.free ? I18n.text("BUILD_FREE") + "   ·   " + text : text;
  },

  /** a SHAPES row by id */
  _shape(id) {
    for (let i = 0; i < BuildMode.SHAPES.length; i++)
      if (BuildMode.SHAPES[i].id === id) return BuildMode.SHAPES[i];
    return BuildMode.SHAPES[0];
  },

  /**
   * per-frame: toggle on B, then (while active + not over the HUD) place on LMB / deconstruct on
   * RMB at the hovered cell. call from step() after Interactable.update, outside the tick loop.
   */
  update(scene) {
    // DEV: F6 toggles free build (no settlement gate, no wood)
    if (DEV_MODE && keyboard_check_pressed(vk_f6)) {
      BuildMode.free = !BuildMode.free;
      Toast.push(
        I18n.text(BuildMode.free ? "BUILD_FREE_ON" : "BUILD_FREE_OFF"),
        { type: "info" },
      );
    }
    // B toggles build mode, but it only OPENS on an allied map (the level's Settlement owned by
    // the player's faction or an ally) — "you can only build in an allied settlement" — or under
    // free build. Closing is free.
    if (Input.get("build").pressed()) {
      if (scene._buildActive) scene._buildActive = false;
      else if (BuildMode.free || BuildMode._allied(scene))
        scene._buildActive = true;
      else Toast.push(I18n.text("BUILD_NEED_SETTLEMENT"), { type: "info" });
    }
    // active only when toggled on AND the build context owns input — an open window makes the
    // context "window" (priority over build), so building pauses and window clicks can't place/remove.
    const on = scene._buildActive === true && InputContext.is("build");
    BuildMode.active = on;
    scene._buildHud.enabled = on;
    if (!on) {
      scene._buildBar.catbar.close(); // collapse any open flyout when leaving build mode
      scene._buildDrag = undefined;
      return;
    }

    const grid = scene.level.grid;
    const drag = scene._buildDrag;

    // skip world edits while the cursor is over the build HUD (a bar click must not place behind
    // it); a drag let go over it is cancelled, never applied
    if (BuildMode._overHud(scene)) {
      scene._buildCell = undefined;
      if (drag !== undefined && !BuildMode._dragHeld(drag))
        scene._buildDrag = undefined;
      return;
    }

    // scene-latched world cursor (pitch-aware) — mouse_x/mouse_y are wrong under the pitched camera
    const cell = grid.worldToGrid(scene.mouseWorld.x, scene.mouseWorld.y);
    scene._buildCell = cell;
    if (cell.x < 0 || cell.y < 0 || cell.x >= grid.cols || cell.y >= grid.rows) {
      if (drag !== undefined && !BuildMode._dragHeld(drag))
        scene._buildDrag = undefined; // let go off the grid: cancelled
      return;
    }

    if (drag === undefined) {
      // a press: a single-cell brush acts at once, a shape anchors a drag. LMB reuses the edge
      // latched by UIPointer.poll (the poll-once rule — UIPointer); RMB is unread elsewhere, so
      // its single live query is safe.
      if (UIPointer.pressed) {
        if (BuildMode._single(scene)) BuildMode._tryPlace(scene, cell.x, cell.y);
        else scene._buildDrag = { x: cell.x, y: cell.y, remove: false };
      } else if (mouse_check_button_pressed(mb_right)) {
        if (scene._buildShape === "cell")
          BuildMode._tryRemove(scene, cell.x, cell.y);
        else scene._buildDrag = { x: cell.x, y: cell.y, remove: true };
      }
      return;
    }
    if (BuildMode._dragHeld(drag)) return; // still dragging — drawWorld previews the shape

    // the release: act on every cell the shape spans between the anchor and this cell
    scene._buildDrag = undefined;
    const shape = scene._buildShape;
    const cells = BuildMode._shapeCells(shape, drag.x, drag.y, cell.x, cell.y);
    if (drag.remove) BuildMode._removeCells(scene, cells);
    else if (shape === "capture")
      BuildMode._capture(scene, drag.x, drag.y, cell.x, cell.y);
    else BuildMode._placeCells(scene, cells);
  },

  /** is the button a drag started on still held (RMB polled live — one query per frame) */
  _dragHeld(drag) {
    return drag.remove ? mouse_check_button(mb_right) : UIPointer.down;
  },

  /**
   * does the brush act on one cell at once: the cell shape, or an entity item under any brush
   * but capture (an entity never tiles a shape)
   */
  _single(scene) {
    const shape = scene._buildShape;
    if (shape === "cell") return true;
    if (shape === "capture") return false;
    return scene._buildItem.kind === "entity";
  },

  /**
   * The cells a shape spans between two corner cells (inclusive), as [gx, gy] pairs: a filled
   * rect, its `frame` (the perimeter — a wall run around a room), or a Bresenham `line`.
   */
  _shapeCells(shape, x0, y0, x1, y1) {
    const out = [];
    if (shape === "line") {
      let x = x0;
      let y = y0;
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let more = true;
      while (more) {
        out.push([x, y]);
        if (x === x1 && y === y1) more = false;
        else {
          const e2 = 2 * err;
          if (e2 >= dy) {
            err += dy;
            x += sx;
          }
          if (e2 <= dx) {
            err += dx;
            y += sy;
          }
        }
      }
      return out;
    }
    const ax = Math.min(x0, x1);
    const bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1);
    const by = Math.max(y0, y1);
    for (let y = ay; y <= by; y++)
      for (let x = ax; x <= bx; x++) {
        if (shape === "frame")
          if (x !== ax && x !== bx && y !== ay && y !== by) continue;
        out.push([x, y]);
      }
    return out;
  },

  /**
   * Place the selected TILE item over `cells` as ONE build: only the placeable cells count, the
   * whole wood cost is paid up front (nothing partial — half a wall is worse than none), and each
   * solid layer touched is remeshed once at the end.
   */
  _placeCells(scene, cells) {
    const item = scene._buildItem;
    if (item.kind !== "tile") return; // an entity item never reaches here (_single)
    const todo = [];
    for (let i = 0; i < cells.length; i++)
      if (BuildMode._cellFree(scene, cells[i][0], cells[i][1]))
        todo.push(cells[i]);
    if (todo.length === 0) return;
    const cost = todo.length * item.cost;
    if (!BuildMode.free) {
      const inv = scene.level.entities.get(scene.playerId, Inventory);
      if (inv === undefined || !InventorySystem.has(inv, BuildMode.RESOURCE, cost)) {
        Toast.push(I18n.text("BUILD_NO_WOOD", cost), { type: "warn" });
        return;
      }
      InventorySystem.remove(inv, BuildMode.RESOURCE, cost);
    }
    const remesh = {};
    for (let i = 0; i < todo.length; i++) {
      const solid = BuildMode.applyItem(scene, todo[i][0], todo[i][1], item, {
        deferRemesh: true,
      });
      if (solid === true) remesh[item.layer] = true;
    }
    BuildMode.remeshLayers(scene, remesh);
    scene._invDirty = true;
    Log.info(`built ${todo.length}x ${item.id} (${scene._buildShape})`);
  },

  /** deconstruct over `cells` as one batch — each solid layer touched remeshed once */
  _removeCells(scene, cells) {
    const remesh = {};
    let n = 0;
    for (let i = 0; i < cells.length; i++)
      if (BuildMode._tryRemove(scene, cells[i][0], cells[i][1], remesh)) n++;
    BuildMode.remeshLayers(scene, remesh);
    if (n > 0) Log.info(`removed ${n} (${scene._buildShape})`);
  },

  /** remesh the colliders of every solid layer keyed true in `remesh` — a batch's one remesh */
  remeshLayers(scene, remesh) {
    const keys = Object.keys(remesh);
    for (let i = 0; i < keys.length; i++)
      TileEdit.remesh(
        scene.level.entities,
        scene.level.grid,
        scene[keys[i] + "Layer"],
        scene[keys[i] + "Colliders"],
      );
  },

  /**
   * DEV: capture the dragged rect as a prefab body (Blueprint.capture) and write it to the save
   * dir as the pretty literal contentPrefabs takes — the authoring exit of the scratch site.
   */
  _capture(scene, x0, y0, x1, y1) {
    const ax = Math.min(x0, x1);
    const ay = Math.min(y0, y1);
    const plan = Blueprint.capture(scene, ax, ay, Math.max(x0, x1), Math.max(y0, y1));
    const name = `prefab_${scene.level.id}_${ax}_${ay}.json`;
    if (Blueprint.export(plan, name))
      Toast.push(I18n.text("BUILD_CAPTURED", plan.cols, plan.rows, name), {
        type: "success",
      });
    else Toast.push(I18n.text("BUILD_CAPTURE_FAIL"), { type: "error" });
    Log.info(
      `captured ${plan.cols}x${plan.rows} → ${name} — ${plan.tiles.length} channel(s), ${plan.spawns.length} spawn(s)`,
    );
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

  /** is the level an allied settlement — owned by the player's faction or an ally? gates build mode. */
  _allied(scene) {
    const owner = Settlement.owner(scene.level);
    return owner !== undefined && FactionSystem.isAlly(owner, BuildMode.FACTION);
  },

  /**
   * can the selected item stand at (gx, gy) at all: an allied map (or free build), the cell empty
   * across every buildable tile layer and the built entities, and a SOLID item (a wall / any
   * entity — not a floor) not on the player's own cell. The per-cell test a shape runs; wood is
   * the batch's business.
   */
  _cellFree(scene, gx, gy) {
    const grid = scene.level.grid;
    if (!BuildMode.free && !BuildMode._allied(scene)) return false;
    const lkeys = BuildMode.tileLayerKeys();
    for (let i = 0; i < lkeys.length; i++)
      if (TileEdit.occupied(scene[lkeys[i] + "Layer"], gx, gy)) return false;
    if (scene._builtEnts[gx + "," + gy] !== undefined) return false;
    const item = scene._buildItem;
    // a crop roots only on its species' ground, and never over a standing body or prop
    if (item.species !== undefined) {
      if (!FloraSystem.canRoot(scene, contentFlora.get(item.species), gx, gy))
        return false;
    }
    const solid = !(
      item.kind === "tile" && contentTiles.get(item.layer).solid !== true
    );
    if (solid) {
      const pp = scene.level.entities.get(scene.playerId, Position);
      if (pp !== undefined) {
        const pc = grid.worldToGrid(pp.x, pp.y);
        if (pc.x === gx && pc.y === gy) return false;
      }
    }
    return true;
  },

  /** _cellFree plus the wood for ONE placement — shared by the single place + cursor highlight */
  _canBuild(scene, gx, gy) {
    if (!BuildMode._cellFree(scene, gx, gy)) return false;
    if (BuildMode.free) return true;
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    if (inv === undefined) return false;
    return InventorySystem.has(inv, BuildMode.RESOURCE, scene._buildItem.cost);
  },

  _tryPlace(scene, gx, gy) {
    if (!BuildMode._canBuild(scene, gx, gy)) return;
    const item = scene._buildItem;
    if (!BuildMode.free) {
      const inv = scene.level.entities.get(scene.playerId, Inventory);
      InventorySystem.remove(inv, BuildMode.RESOURCE, item.cost);
    }
    BuildMode.applyItem(scene, gx, gy, item); // immediate remesh (deferRemesh unset)
    scene._invDirty = true;
    Log.info(`built ${item.id} at ${gx},${gy}`);
  },

  // Place a resolved catalog `item` at a cell — the SHARED placement core of live LMB placement
  // and Blueprint.stamp. It does NOT gate on cost/validity (the caller decides) or
  // touch inventory. Options:
  //   opts.snapshot    restore an EXACT entity from an EntitySnapshot (chest contents, turret
  //                    damage) instead of a fresh make(); Position is overridden to this cell.
  //   opts.deferRemesh skip the solid-collider remesh (a batch stamp remeshes once at the end).
  // Updates _built / _builtEnts. Returns the entity id (entity) or whether a solid tile was placed
  // (so a deferred caller knows that layer's remesh is pending).
  applyItem(scene, gx, gy, item, opts = {}) {
    const grid = scene.level.grid;
    const key = gx + "," + gy;
    if (item.kind === "tile") {
      // resolve layer/type by the item's LAYERS key; `mat` picks a material TileType (per-cell
      // wall materials). A solid layer (wall/fence) has its own colliders to remesh (<key>Colliders).
      const layer = scene[item.layer + "Layer"];
      const type =
        item.mat !== undefined
          ? scene[item.layer + "Types"][item.mat]
          : scene[item.layer + "Type"];
      TileEdit.set(layer, gx, gy, type);
      GrassSystem.cut(scene, gx, gy); // built ground kills the grass under it
      const solid = contentTiles.get(item.layer).solid === true;
      // nested, not `solid && …`: the short-circuit corrupts its left operand (docs/GMRT.md
      // #15549) and the return below would read false for a deferred solid tile
      if (opts.deferRemesh !== true) {
        if (solid)
          TileEdit.remesh(
            scene.level.entities,
            grid,
            layer,
            scene[item.layer + "Colliders"],
          );
      }
      BuildMode._markTileDirty(scene, item.layer);
      scene._built[key] = item.id;
      return solid;
    }
    // entity: an exact snapshot restore (state preserved) or a fresh make() (a new instance).
    // make's optional 3rd arg is the scene (the door auto-orients off the wall layer); a built
    // prop is identical to a file/streamed one and persists via EntitySnapshot (see ColonyMap).
    let id;
    if (opts.snapshot !== undefined) {
      const wp = grid.gridToWorld(gx, gy);
      id = EntitySnapshot.restore(scene.level.entities, opts.snapshot, {
        [Position]: { x: wp.x, y: wp.y, z: 0 },
      });
    } else {
      id = ColonySpawn.spawnEntity(scene.level.entities, grid, item.make(gx, gy, scene));
    }
    scene._builtEnts[key] = { ent: id, itemId: item.id };
    GrassSystem.cut(scene, gx, gy); // a built prop's pad kills the grass under it too
    return id;
  },

  /**
   * Deconstruct whatever the player built at (gx, gy) — a built entity first, else a built tile.
   * Returns whether anything was removed. With `remesh` (a solid-layer-key → true map) given, a
   * solid tile's collider remesh is recorded there instead of run at once (a batch's one remesh).
   */
  _tryRemove(scene, gx, gy, remesh) {
    const key = gx + "," + gy;
    const grid = scene.level.grid;
    // built entities sit on top of tiles — remove one first if present.
    const ent = scene._builtEnts[key];
    if (ent !== undefined) {
      // a slotted module isn't in any inventory, so return it to the bag or deconstruct deletes it.
      if (scene.level.entities.isValid(ent.ent)) {
        const st = scene.level.entities.get(ent.ent, Interaction);
        if (st !== undefined && st.module !== undefined && st.module !== "") {
          const inv = scene.level.entities.get(scene.playerId, Inventory);
          if (inv !== undefined) InventorySystem.add(inv, st.module, 1);
        }
        // spill the entity's Inventory as drops first, else entities.remove silently deletes the
        // contents. no-op without an Inventory; preserves instance uid/mods on the drop.
        ColonyCombat.spillLoot(scene, ent.ent);
        scene.level.entities.remove(ent.ent);
      }
      BuildMode._refund(scene, ent.itemId);
      delete scene._builtEnts[key];
      scene._invDirty = true;
      Log.info(`removed ${ent.itemId} at ${gx},${gy}`);
      return true;
    }
    const tileId = scene._built[key];
    if (tileId === undefined) return false; // only player-built cells are deconstructable
    const item = BuildMode.item(tileId);
    const lkey = item !== undefined ? item.layer : "floor"; // stale id → floor (non-solid, safe)
    TileEdit.clear(scene[lkey + "Layer"], gx, gy);
    if (contentTiles.get(lkey).solid === true) {
      if (remesh !== undefined) remesh[lkey] = true;
      else
        TileEdit.remesh(
          scene.level.entities,
          grid,
          scene[lkey + "Layer"],
          scene[lkey + "Colliders"],
        );
    }
    BuildMode._markTileDirty(scene, lkey);
    BuildMode._refund(scene, tileId);
    delete scene._built[key];
    scene._invDirty = true;
    Log.info(`removed ${tileId} at ${gx},${gy}`);
    return true;
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
    if (BuildMode.free) return; // nothing was paid
    const item = BuildMode.item(itemId);
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    if (item !== undefined && inv !== undefined)
      InventorySystem.add(inv, BuildMode.RESOURCE, item.cost);
  },

  /**
   * sweep built entities destroyed in combat (a turret brought to 0 HP) out of the deconstruct
   * tracking, so the cell frees + persistence won't snapshot a dead handle. NO wood refund (destroyed,
   * not deconstructed). called every frame from step. keys via Object.keys + index loop (no Map iteration — GMRT-safe).
   */
  reapDestroyed(scene) {
    const entities = scene.level.entities;
    const keys = Object.keys(scene._builtEnts);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const e = scene._builtEnts[k];
      if (!entities.isValid(e.ent)) {
        delete scene._builtEnts[k]; // already gone (removed elsewhere)
        continue;
      }
      const hp = entities.get(e.ent, Health);
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
   * Found the player's settlement at a Survey Post: the whole level, owned by the player's faction,
   * then *spend* the post (detach its Interaction). The founded settlement is the stored state
   * (the level's LevelMeta record, pooled and saved with it), so a post on an already-settled
   * level is still spent — no re-founding.
   */
  claim(scene, postId) {
    const s = Settlement.found(scene.level, {
      name: I18n.text("SETTLEMENT_DEFAULT_NAME"),
      factionId: BuildMode.FACTION,
    });
    if (s !== undefined) {
      Toast.push(I18n.text("SETTLEMENT_FOUNDED"), { type: "success" });
      Log.info(`founded settlement over ${scene.level.id}`);
    }
    scene.level.entities.detach(postId, Interaction); // spent — stop prompting / block re-founding
  },

  /**
   * world-space cursor highlight: green = placeable, yellow = deconstructable, red = invalid;
   * while a shape drag is held, the cells it would act on instead (yellow = remove, cyan =
   * capture, green = place). call from scene.draw().
   */
  drawWorld(scene) {
    if (!BuildMode.active) return;
    const cell = scene._buildCell;
    if (cell === undefined) return;
    const grid = scene.level.grid;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;

    const drag = scene._buildDrag;
    if (drag !== undefined) {
      // the hovered cell clamped onto the grid, so a drag past the edge previews to the edge
      const cx = Math.min(Math.max(cell.x, 0), grid.cols - 1);
      const cy = Math.min(Math.max(cell.y, 0), grid.rows - 1);
      const shape = scene._buildShape;
      const cells = BuildMode._shapeCells(shape, drag.x, drag.y, cx, cy);
      let col = c_lime;
      if (drag.remove) col = c_yellow;
      else if (shape === "capture") col = c_aqua;
      draw_set_color(col);
      draw_set_alpha(0.25);
      for (let i = 0; i < cells.length; i++) {
        const wx = cells[i][0] * cw;
        const wy = cells[i][1] * ch;
        draw_rectangle(wx, wy, wx + cw, wy + ch, false);
      }
      draw_set_alpha(1);
      const x1 = Math.min(drag.x, cx) * cw;
      const y1 = Math.min(drag.y, cy) * ch;
      const x2 = (Math.max(drag.x, cx) + 1) * cw;
      const y2 = (Math.max(drag.y, cy) + 1) * ch;
      draw_rectangle(x1, y1, x2, y2, true);
      draw_set_color(c_white);
      return;
    }

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

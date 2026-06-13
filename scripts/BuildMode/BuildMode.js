// Grid build mode for the TopDown template (mirrors the Interactable module shape):
// a toggleable mode that snaps to the level grid, consumes wood to place a wall or
// floor tile, and refunds wood on deconstruct. Building is gated to a *claimed*
// buildable zone (the "buildable" ZoneMap channel) — the player claims an area by
// pressing E at a Claim Post station (Interactable routes that to BuildMode.claim).
//
// All per-scene state lives on the SCENE (namespaced `_build*`); BuildMode is a
// stateless singleton like Interactable/CraftSystem. The one exception is the static
// `active` flag, mirrored each frame so RpgController can suppress weapon fire while
// building (LMB places tiles instead of shooting).
//
// Scene contract (set in create()): world, ctrl.id, level, ui, wallLayer, floorLayer,
// colliders, wallType, floorType, buildZoneId.
globalThis.BuildMode = {
  active: false, // mirror of scene._buildActive, read by RpgController to gate fire
  RESOURCE: "wood",
  COST: 1, // wood per tile (place consumes, deconstruct refunds)
  CLAIM_HALF_W: 3, // claimed rect half-extent in cells (so 7×5 around the post)
  CLAIM_HALF_H: 2,

  // Build the toggled build-mode HUD and init per-scene state. Call once from create().
  build(scene) {
    scene._built = {}; // "gx,gy" -> palette index (0 wall, 1 floor): deconstructable cells
    scene._buildActive = false;
    scene._buildPalette = 0; // 0 = wall, 1 = floor
    scene._buildCell = undefined; // last hovered cell, for drawWorld
    BuildMode.active = false;

    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 140,
      alignItems: "center",
    });
    const card = gemsCard({ width: 560, padding: GemsTheme.pad });
    const row = new UIElement({ width: "100%", height: 24 });
    row.insertChild(
      gemsLabel(() => BuildMode._hudText(scene), {
        halign: fa_center,
        color: GemsTheme.text,
      }),
    );
    card.insertChild(row);
    wrap.insertChild(card);
    wrap.enabled = false;
    scene._buildHud = wrap;
    scene.ui.insertChild(wrap);
  },

  _hudText(scene) {
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const wood =
      inv !== undefined ? InventorySystem.count(inv, BuildMode.RESOURCE) : 0;
    const type =
      scene._buildPalette === 0
        ? I18n.text("BUILD_WALL")
        : I18n.text("BUILD_FLOOR");
    return (
      I18n.text("BUILD_MODE") +
      ": " +
      type +
      "   " +
      I18n.text("BUILD_HINT", wood)
    );
  },

  // Per-frame: toggle on B, mirror state, then (while active) cycle palette on the wheel
  // and place/deconstruct on the mouse edges. Call from step() after Interactable.update,
  // outside the tick loop.
  update(scene) {
    if (Input.get("build").pressed()) scene._buildActive = !scene._buildActive;
    const on = scene._buildActive === true;
    BuildMode.active = on;
    scene._buildHud.enabled = on;
    if (!on) return;

    // Palette cycle (wheel). Either direction flips wall<->floor (only two entries).
    if (mouse_wheel_up() || mouse_wheel_down())
      scene._buildPalette = scene._buildPalette === 0 ? 1 : 0;

    const level = scene.level;
    const cell = level.worldToGrid(mouse_x, mouse_y);
    scene._buildCell = cell;
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= level.cols ||
      cell.y >= level.rows
    )
      return;

    // LMB edge is the one already latched by SlotDrag.poll this frame — reuse it rather
    // than re-querying mouse_check_button_pressed(mb_left) (realtime sampling returns
    // different values per call; see GMRT-Safe Idioms). RMB is unread elsewhere, so a
    // single query here is safe.
    if (SlotDrag.pressed) BuildMode._tryPlace(scene, cell.x, cell.y);
    else if (mouse_check_button_pressed(mb_right))
      BuildMode._tryRemove(scene, cell.x, cell.y);
  },

  // True when the current palette tile can be placed at (gx, gy): inside the claimed
  // buildable zone, both layers empty there, enough wood, and (for walls) not the cell
  // the player stands on. Shared by the place action and the cursor highlight.
  _canBuild(scene, gx, gy) {
    const level = scene.level;
    const zmap = level.zoneMap("buildable");
    if (zmap === undefined || zmap.idAt(gx, gy) === 0) return false;
    if (TileEdit.occupied(scene.wallLayer, gx, gy)) return false;
    if (TileEdit.occupied(scene.floorLayer, gx, gy)) return false;
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    if (
      inv === undefined ||
      !InventorySystem.has(inv, BuildMode.RESOURCE, BuildMode.COST)
    )
      return false;
    if (scene._buildPalette === 0) {
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
    const level = scene.level;
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    InventorySystem.remove(inv, BuildMode.RESOURCE, BuildMode.COST);
    if (scene._buildPalette === 0) {
      TileEdit.set(level, scene.wallLayer, gx, gy, scene.wallType);
      TileEdit.remesh(scene.world, level, scene.wallLayer, scene.colliders);
    } else {
      TileEdit.set(level, scene.floorLayer, gx, gy, scene.floorType);
    }
    scene._built[gx + "," + gy] = scene._buildPalette;
    scene._invDirty = true;
    Log.info(
      `built ${scene._buildPalette === 0 ? "wall" : "floor"} at ${gx},${gy}`,
    );
  },

  _tryRemove(scene, gx, gy) {
    const key = gx + "," + gy;
    const palette = scene._built[key];
    if (palette === undefined) return; // only player-built cells are deconstructable
    const level = scene.level;
    if (palette === 0) {
      TileEdit.clear(level, scene.wallLayer, gx, gy);
      TileEdit.remesh(scene.world, level, scene.wallLayer, scene.colliders);
    } else {
      TileEdit.clear(level, scene.floorLayer, gx, gy);
    }
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    InventorySystem.add(inv, BuildMode.RESOURCE, BuildMode.COST); // refund
    delete scene._built[key];
    scene._invDirty = true;
    Log.info(`removed ${palette === 0 ? "wall" : "floor"} at ${gx},${gy}`);
  },

  // Claim the buildable area around a Claim Post (Station kind "claim"). Paints a fixed
  // rect into the "buildable" zone channel; idempotent (re-claim just repaints).
  claim(scene, postId) {
    const level = scene.level;
    const pos = scene.world.get(Position, postId);
    if (pos === undefined) return;
    const zmap = level.zoneMap("buildable");
    if (zmap === undefined) return;
    const c = level.worldToGrid(pos.x, pos.y);
    const x1 = Math.max(0, c.x - BuildMode.CLAIM_HALF_W);
    const y1 = Math.max(0, c.y - BuildMode.CLAIM_HALF_H);
    const x2 = Math.min(level.cols - 1, c.x + BuildMode.CLAIM_HALF_W);
    const y2 = Math.min(level.rows - 1, c.y + BuildMode.CLAIM_HALF_H);
    zmap.paintRect(scene.buildZoneId, x1, y1, x2, y2);
    Toast.push(I18n.text("BUILD_CLAIMED"), { type: "success" });
    Log.info(`claimed build area (${x1},${y1})-(${x2},${y2})`);
  },

  // World-space cursor highlight over the snapped hovered cell — green = placeable,
  // yellow = deconstructable (player-built), red = invalid. Call from scene.draw().
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

    const wx = cell.x * level.cellWidth;
    const wy = cell.y * level.cellHeight;
    let col;
    if (scene._built[cell.x + "," + cell.y] !== undefined) col = c_yellow;
    else col = BuildMode._canBuild(scene, cell.x, cell.y) ? c_lime : c_red;

    draw_set_color(col);
    draw_set_alpha(0.3);
    draw_rectangle(wx, wy, wx + level.cellWidth, wy + level.cellHeight, false);
    draw_set_alpha(1);
    draw_rectangle(wx, wy, wx + level.cellWidth, wy + level.cellHeight, true);
    draw_set_color(c_white);
  },
};

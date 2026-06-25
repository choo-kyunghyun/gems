// World-space gameplay overlay for the RPG scene, drawn in world space from sceneRpg.draw().
// Draws item drops (rarity squares) + bullets (dots), plus the reach-quest zone when the scene
// exposes one. (Originally shared with the platformer — replaced the near-identical per-genre
// PlatformerUI/TopDownUI — but RPG-only now.) The HUD / inventory / dialogue are real UI panels
// the scene builds on the GUI layer — not here. `_rarityColor` is shared with the inventory rows.
globalThis.RpgWorldOverlay = {
  _rarityColor(itemId) {
    const it = Item.get(itemId);
    const r = it !== undefined ? Rarity.get(it.rarity) : undefined;
    return r !== undefined ? r.color : c_white;
  },

  // Item-icon markup prefix for a UIRichText row — "[spr=spr_item_<id>] " when the item has a real
  // icon sprite (wired in RpgItems.register by the spr_item_<id> convention), else "" so a spriteless
  // item leaves no gap. Shared by the hotbar / equipment / weapon-mod text rows. The name matches the
  // wiring convention (item_sprites.py); the guard reads the already-resolved ref off the item, so we
  // don't need sprite_get_name (unused/unverified on GMRT).
  iconTag(itemId) {
    const it = Item.get(itemId);
    if (it === undefined || !sprite_exists(it.sprite)) return "";
    return "[spr=spr_item_" + itemId + "] ";
  },

  drawWorld(scene) {
    const world = scene.world;

    const drops = world.query(ItemDrop, Position);
    for (const id of drops) {
      const p = world.get(Position, id);
      const d = world.get(ItemDrop, id);
      const it = Item.get(d.itemId);
      const spr = it !== undefined ? it.sprite : -1;
      if (sprite_exists(spr)) {
        // The icon is a centered-origin 16px sprite — draw it centered on the drop position.
        draw_sprite_ext(spr, 0, p.x, p.y, 1, 1, 0, c_white, 1);
      } else {
        // No icon for this item — fall back to the rarity-colored square.
        draw_set_color(this._rarityColor(d.itemId));
        draw_rectangle(p.x - 4, p.y - 4, p.x + 4, p.y + 4, false);
        draw_set_color(c_black);
        draw_rectangle(p.x - 4, p.y - 4, p.x + 4, p.y + 4, true);
      }
    }

    const bullets = world.query(Projectile, Position);
    // 2.5D: lift bullets off the ground to ~body/muzzle height so they read as flying through the
    // air, not skidding on the floor — a world-z offset (negative = up; the camera up vector maps
    // it up the screen). A round dot has no facing, so no billboard tilt is needed, just the lift.
    // Drawn depth-test off so a tracer is never hidden by a body it passes (a transient cue, always
    // visible — like FloatingText). Flat top-down (pitch 0) lifts nothing and keeps the old path.
    const lift =
      scene.camera !== undefined && scene.camera.followPitch !== 0 ? 16 : 0;
    if (lift !== 0) {
      gpu_set_ztestenable(false);
      matrix_set(matrix_world, matrix_build(0, 0, -lift, 0, 0, 0, 1, 1, 1));
    }
    draw_set_color(make_colour_rgb(255, 230, 90));
    for (const id of bullets) {
      const p = world.get(Position, id);
      draw_circle(p.x, p.y, 2, false);
    }
    if (lift !== 0) {
      matrix_set(matrix_world, matrix_build_identity());
      gpu_set_ztestenable(true);
    }

    // Reach-quest zone: only when the scene defines one and it's unmet.
    if (scene.reachZone !== undefined && !scene.reachDone) {
      const z = scene.reachZone;
      draw_set_alpha(0.35);
      draw_set_color(make_colour_rgb(120, 200, 255));
      draw_rectangle(z.x1, z.y1, z.x2, z.y2, false);
      draw_set_alpha(1);
    }
    draw_set_color(c_white);
  },
};

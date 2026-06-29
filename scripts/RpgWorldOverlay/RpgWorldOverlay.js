// World-space gameplay overlay for the RPG scene, drawn in world space from sceneRpg.draw().
// Draws item drops (rarity squares) + projectile dots (Projectile entities — lobbed/grenade shots;
// guns are hitscan now) + fading hitscan tracers, plus the reach-quest zone when the scene exposes
// one. (Originally shared with the platformer — replaced the near-identical per-genre
// PlatformerUI/TopDownUI — but RPG-only now.) The HUD / inventory / dialogue are real UI panels
// the scene builds on the GUI layer — not here. `_rarityColor` is shared with the inventory rows.
globalThis.RpgWorldOverlay = {
  // Live hitscan shot streaks: { x0, y0, x1, y1, age, life }. Pushed by the firers (RpgPlayer +
  // CombatAI), aged + culled in drawWorld on Time.raw, cleared on scene teardown (sceneRpg.destroy).
  _tracers: [],

  // Record a fading gunshot tracer from the muzzle (x0,y0) to the impact point (x1,y1) — the visual
  // replacing the old in-flight bullet dot. Both the player and turrets push one (see Combat.hitscan).
  pushTracer(x0, y0, x1, y1) {
    this._tracers.push({ x0, y0, x1, y1, age: 0, life: 0.07 });
  },

  clearTracers() {
    this._tracers = [];
  },

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

    // 2.5D: lift in-air cues (projectile dots + hitscan tracers) off the ground to ~body/muzzle
    // height so they read as flying, not skidding — a world-z offset (negative = up; the camera up
    // vector maps it up the screen). Drawn depth-test off so they're never hidden by a body they pass
    // (transient cues, always visible — like FloatingText). Flat top-down (pitch 0) lifts nothing.
    const lift =
      scene.camera !== undefined && scene.camera.followPitch !== 0 ? 16 : 0;
    if (lift !== 0) {
      gpu_set_ztestenable(false);
      matrix_set(matrix_world, matrix_build(0, 0, -lift, 0, 0, 0, 1, 1, 1));
    }
    // Projectile entities (lobbed/grenade shots) as round dots. None while only hitscan guns fire,
    // but the path stays for the kept ProjectileSystem (a round dot has no facing — just the lift).
    draw_set_color(make_colour_rgb(255, 230, 90));
    const bullets = world.query(Projectile, Position);
    for (const id of bullets) {
      const p = world.get(Position, id);
      draw_circle(p.x, p.y, 2, false);
    }
    // Hitscan tracers: a fading muzzle->impact streak per shot, aged on Time.raw (a brief flash, like
    // the muzzle ParticleFx — independent of sim pause/dilation). Plain draw_line: the bare-width and
    // *_color line variants render nothing / are unverified on GMRT (see RenderGrid/RenderWeather).
    const tracers = this._tracers;
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i];
      tr.age += Time.raw;
      if (tr.age >= tr.life) {
        tracers.splice(i, 1);
        continue;
      }
      draw_set_alpha(1 - tr.age / tr.life);
      draw_line(tr.x0, tr.y0, tr.x1, tr.y1);
    }
    draw_set_alpha(1);
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

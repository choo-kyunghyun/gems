// World-space gameplay overlay for the RPG scene — item drops (rarity squares), projectile dots
// (lobbed/grenade Projectile entities), fading hitscan tracers, and the reach-quest zone. Drawn
// from sceneRpg.draw() AFTER renderer.draw() because RenderChunks paints an opaque ground fill that
// would hide it. (HUD/inventory/dialogue are GUI-layer panels, not here.) `_rarityColor` shared
// with the inventory rows.
globalThis.RpgWorldOverlay = {
  // live hitscan shot streaks pushed by the firers (RpgPlayer + CombatAI), aged on Time.raw
  _tracers: [],

  // record a fading muzzle->impact gunshot tracer (see Combat.hitscan)
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

  // item-icon markup prefix for a UIRichText row — "[spr=spr_item_<id>] " when the item has an icon
  // sprite, else "" (no gap). Guards on the resolved ref, not sprite_get_name (unverified on GMRT).
  iconTag(itemId) {
    const it = Item.get(itemId);
    if (it === undefined || !sprite_exists(it.sprite)) return "";
    return "[spr=spr_item_" + itemId + "] ";
  },

  drawWorld(scene) {
    const entities = scene.entities;

    const drops = entities.query(ItemDrop, Position);
    for (const id of drops) {
      const p = entities.get(Position, id);
      const d = entities.get(ItemDrop, id);
      const it = Item.get(d.itemId);
      const spr = it !== undefined ? it.sprite : -1;
      if (sprite_exists(spr)) {
        // centered-origin 16px icon drawn ×2 (32 world px on the 32px-cell world)
        draw_sprite_ext(spr, 0, p.x, p.y, 2, 2, 0, c_white, 1);
      } else {
        // no icon — fall back to the rarity-colored square
        draw_set_color(this._rarityColor(d.itemId));
        draw_rectangle(p.x - 8, p.y - 8, p.x + 8, p.y + 8, false);
        draw_set_color(c_black);
        draw_rectangle(p.x - 8, p.y - 8, p.x + 8, p.y + 8, true);
      }
    }

    // 2.5D: lift in-air cues (projectile dots + tracers) off the ground via a world-z offset so they
    // read as flying. Depth-test off so a body they pass can't hide them (transient, always visible).
    // Flat top-down (pitch 0) lifts nothing.
    const lift =
      scene.camera !== undefined && scene.camera.followPitch !== 0 ? 32 : 0;
    if (lift !== 0) {
      gpu_set_ztestenable(false);
      matrix_set(matrix_world, matrix_build(0, 0, -lift, 0, 0, 0, 1, 1, 1));
    }
    // Projectile entities (lobbed/grenade) as round dots — none while only hitscan guns fire, but
    // the path stays for the kept ProjectileSystem.
    draw_set_color(make_colour_rgb(255, 230, 90));
    const bullets = entities.query(Projectile, Position);
    for (const id of bullets) {
      const p = entities.get(Position, id);
      draw_circle(p.x, p.y, 4, false);
    }
    // Hitscan tracers: a fading muzzle->impact streak aged on Time.raw. Plain draw_line — the
    // bare-width and *_color line variants render nothing on GMRT (see RenderGrid/RenderWeather).
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

    // reach-quest zone, only when the scene defines one and it's unmet
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

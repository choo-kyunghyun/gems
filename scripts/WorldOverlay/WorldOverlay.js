/**
 * World-space gameplay overlay for the colony scene: drops, projectiles, fading hitscan tracers
 * and the Reach regions. Drawn after the world, whose ground passes paint an opaque fill that
 * would hide it.
 */
globalThis.WorldOverlay = {
  _tracers: [], // aged on real time

  pushTracer(x0, y0, x1, y1) {
    WorldOverlay._tracers.push({ x0, y0, x1, y1, age: 0, life: 0.07 });
  },

  clearTracers() {
    WorldOverlay._tracers = [];
  },

  /**
   * Rich-text icon prefix, or "" for an item without an icon. The def's sprite by name, never one
   * derived from the item id: ids share icons, and an unknown name silently draws nothing.
   */
  iconTag(itemId) {
    const it = Item.get(itemId);
    if (it === undefined || !sprite_exists(it.sprite)) return "";
    return "[spr=" + sprite_get_name(it.sprite) + "] ";
  },

  drawWorld(scene) {
    const entities = scene.level.entities;

    // the rarity color stands in where a drop's item has no icon.
    const pitch = CameraSystem.view(scene.level).pitch;
    entities.forEach([ItemDrop, Position], (_id, d, p) => {
      const it = Item.get(d.itemId);
      const spr = it !== undefined ? it.sprite : -1;
      const color = InvTable.rarityColor(d.itemId);
      if (sprite_exists(spr)) {
        const f = AssetMeta.fit(spr, 1);
        draw_sprite_ext(spr, 0, p.x, p.y, f, f, 0, c_white, 1);
      } else {
        draw_set_color(color);
        draw_rectangle(p.x - 8, p.y - 8, p.x + 8, p.y + 8, false);
        draw_set_color(c_black);
        draw_rectangle(p.x - 8, p.y - 8, p.x + 8, p.y + 8, true);
      }
    });

    // in-air cues lift off the ground so they read as flying, with no depth test so a body they
    // pass can't hide them.
    const lift = pitch !== 0 ? 32 : 0;
    if (lift !== 0) {
      gpu_set_ztestenable(false);
      matrix_set(matrix_world, matrix_build(0, 0, -lift, 0, 0, 0, 1, 1, 1));
    }
    draw_set_color(make_colour_rgb(255, 230, 90));
    const fuse = entities.column(Fuse);
    const slots = Handle.SLOTS;
    entities.forEach([Projectile, Position], (id, _proj, p) => {
      if (fuse[id % slots] !== undefined)
        draw_sprite_ext(pixItemGrenade, 0, p.x, p.y, 1, 1, 0, c_white, 1);
      else draw_circle(p.x, p.y, 4, false);
    });
    const tracers = WorldOverlay._tracers;
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

    draw_set_alpha(0.35);
    draw_set_color(make_colour_rgb(120, 200, 255));
    entities.forEach([Reach, Position, BBox], (_id, _r, pos, box) => {
      const x1 = pos.x + box.x;
      const y1 = pos.y + box.y;
      draw_rectangle(x1, y1, x1 + box.width, y1 + box.height, false);
    });
    draw_set_alpha(1);
    draw_set_color(c_white);
  },
};

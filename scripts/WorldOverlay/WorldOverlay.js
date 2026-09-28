/**
 * World-space gameplay overlay for the colony scene: projectiles, fading hitscan tracers
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
   * Rich-text icon prefix: the item's bag icon in its rarity color, or "" for an unknown id. The
   * icon goes by name, and an unknown name silently draws nothing.
   */
  iconTag(itemId) {
    const it = Item.get(itemId);
    if (it === undefined) return "";
    const hex = (v) => v.toString(16).padStart(2, "0");
    const c = InvTable.rarityColor(itemId);
    const tint = "#" + hex(color_get_red(c)) + hex(color_get_green(c)) + hex(color_get_blue(c));
    return "[c=" + tint + "][spr=" + sprite_get_name(Bag.icon(it)) + "][/c] ";
  },

  drawWorld(scene) {
    const entities = scene.level.entities;

    const pitch = CameraSystem.view(scene.level).pitch;
    // in-air cues lift off the ground so they read as flying, with no depth test so a body they
    // pass can't hide them.
    const lift = pitch !== 0 ? 128 : 0;
    if (lift !== 0) {
      gpu_set_ztestenable(false);
      matrix_set(matrix_world, matrix_build(0, 0, -lift, 0, 0, 0, 1, 1, 1));
    }
    draw_set_color(make_colour_rgb(255, 230, 90));
    const fuse = entities.column(Fuse);
    const slots = Handle.SLOTS;
    entities.forEach([Projectile, Position], (id, _proj, p) => {
      if (fuse[id % slots] !== undefined) {
        const f = AssetMeta.fit(pixItemGrenadeFrag, 1);
        draw_sprite_ext(pixItemGrenadeFrag, 0, p.x, p.y, f, f, 0, c_white, 1);
      } else draw_circle(p.x, p.y, 16, false);
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

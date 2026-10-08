/**
 * World-space gameplay overlay for the colony scene: hidden drops' silhouettes, projectiles,
 * fading hitscan tracers and the Reach regions. Drawn after the world, whose ground passes
 * paint an opaque fill that would hide it. A tracer lives on its level, in its coordinates.
 */
globalThis.WorldOverlay = {
  LIFT: 32, // world px the in-air cues rise under a pitched camera
  DOT: 4, // a bullet's radius, world px
  NUDGE: 1, // world px a hidden drop's silhouette steps toward the camera
  KEY: "tracers", // the tracers' derived token on the level's own entity
  _flatU: undefined, // the world shader's uniforms, looked up on the first silhouette

  /** The level's tracers, `{ x0, y0, x1, y1, age, life }` each, aged on real time. */
  tracers(level) {
    return level.entities.derive(level.self, WorldOverlay.KEY, () => []);
  },

  pushTracer(level, x0, y0, x1, y1) {
    WorldOverlay.tracers(level).push({ x0, y0, x1, y1, age: 0, life: 0.07 });
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

  /** `pitch` is the camera's, in radians; 0 is flat top-down. */
  draw(level, pitch) {
    const entities = level.entities;
    if (pitch !== 0) WorldOverlay._hiddenDrops(entities, pitch);
    // in-air cues lift off the ground so they read as flying, with no depth test so a body they
    // pass can't hide them.
    const lift = pitch !== 0 ? WorldOverlay.LIFT : 0;
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
      } else draw_circle(p.x, p.y, WorldOverlay.DOT, false);
    });
    const tracers = WorldOverlay.tracers(level);
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

  /**
   * A standing drop's hidden part — behind grass, a wall or a body — redrawn as a flat silhouette
   * in its rarity colour, where the depth test says something nearer covers it. Nudged toward the
   * camera so its own visible pixels never pass.
   */
  _hiddenDrops(entities, pitch) {
    const tall = RenderBillboard.tall(pitch);
    // the world shader, untextured and unlit, fills the texel cutout with the tint alone
    const flat = shaders_are_supported() && shader_is_compiled(shMeshlit);
    if (flat) {
      if (WorldOverlay._flatU === undefined) {
        const u = (name) => shader_get_uniform(shMeshlit, name);
        WorldOverlay._flatU = {
          ambient: u("u_ambient"),
          sunDir: u("u_sunDir"),
          sunColor: u("u_sunColor"),
          chroma: u("u_chroma"),
          wave: u("u_wave"),
          sway: u("u_sway"),
          lightCount: u("u_lightCount"),
          useTex: u("u_useTex"),
          alphaRef: u("u_alphaRef"),
        };
      }
      const u = WorldOverlay._flatU;
      shader_set(shMeshlit);
      shader_set_uniform_f(u.ambient, 1);
      shader_set_uniform_f(u.sunDir, 0, 0, -1, 0);
      shader_set_uniform_f(u.sunColor, 1, 1, 1);
      shader_set_uniform_f(u.chroma, 1);
      shader_set_uniform_f(u.wave, 0);
      shader_set_uniform_f(u.sway, 0);
      shader_set_uniform_f(u.lightCount, 0);
      shader_set_uniform_f(u.useTex, 0);
      shader_set_uniform_f(u.alphaRef, 0.5);
    }
    gpu_set_zfunc(cmpfunc_greater);
    const nudge = WorldOverlay.NUDGE;
    entities.forEach([ItemDrop, Sprite, Position], (_id, d, spr, p) => {
      if (!sprite_exists(spr.sprite)) return;
      matrix_set(matrix_world, matrix_build(p.x, p.y + nudge, 0, -90, 0, 0, 1, 1, tall));
      draw_sprite_ext(
        spr.sprite,
        spr.index,
        0,
        0,
        spr.xscale,
        spr.yscale,
        spr.angle,
        InvTable.rarityColor(d.itemId),
        0.6,
      );
    });
    matrix_set(matrix_world, matrix_build_identity());
    gpu_set_zfunc(cmpfunc_lessequal);
    if (flat) shader_reset();
  },
};

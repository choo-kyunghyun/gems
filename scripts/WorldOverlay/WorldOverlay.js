// World-space gameplay overlay for the colony scene — item drops (icon + a rarity-tinted psDrop stream), the travel
// beacon's psPortal stream, projectile dots,
// fading hitscan tracers, and the reach-quest zone. Drawn from sceneColony.draw() AFTER renderer.draw().
/**
 * Drawn after renderer.draw() because the ground passes paint an opaque fill that would hide it.
 * (HUD/inventory/dialogue are GUI-layer panels, not here.)
 */
globalThis.WorldOverlay = {
  // live hitscan shot streaks pushed by the firers (ColonyPlayer + CombatAI), aged on Time.raw
  _tracers: [],

  /**
   * record a fading muzzle->impact gunshot tracer (see Combat.hitscan)
   */
  pushTracer(x0, y0, x1, y1) {
    this._tracers.push({ x0, y0, x1, y1, age: 0, life: 0.07 });
  },

  clearTracers() {
    this._tracers = [];
  },

  /**
   * item-icon markup prefix for a UIRichText row — "[spr=<name>] " when the item has an icon
   * sprite, else "" (no gap). Emits the RESOLVED ref's name, never the pixItem<Id> convention:
   * aliased ids (contentItems.ICONS) share art whose name doesn't match, and UIRichText would
   * silently draw nothing for the nonexistent name.
   */
  iconTag(itemId) {
    const it = Item.get(itemId);
    if (it === undefined || !sprite_exists(it.sprite)) return "";
    return "[spr=" + sprite_get_name(it.sprite) + "] ";
  },

  drawWorld(scene) {
    const entities = scene.level.entities;

    // Drops: the icon flat at its declared density, plus a psDrop stream HELD per drop entity
    // (ParticleFx.hold; the sweep below releases it once the entity is gone) tinted with the
    // item's rarity color — the visibility cue. 2.5D: the stream draws on a camera-facing plane
    // at the drop's foot (the FloatingText tilt) so its drift rises on screen; a flat top-down
    // camera (pitch 0) leaves it on the ground.
    const pitch = scene.map.camera.pitch;
    const tilt = (-pitch * 180) / Math.PI;
    const ident = matrix_build_identity();
    entities.forEach([ItemDrop, Position], (id, d, p) => {
      const it = Item.get(d.itemId);
      const spr = it !== undefined ? it.sprite : -1;
      const color = InvTable.rarityColor(d.itemId);
      if (sprite_exists(spr)) {
        const f = SpriteMeta.fit(1, spr);
        draw_sprite_ext(spr, 0, p.x, p.y, f, f, 0, c_white, 1);
      } else {
        // no icon — fall back to the rarity-colored square
        draw_set_color(color);
        draw_rectangle(p.x - 8, p.y - 8, p.x + 8, p.y + 8, false);
        draw_set_color(c_black);
        draw_rectangle(p.x - 8, p.y - 8, p.x + 8, p.y + 8, true);
      }
      const fx = ParticleFx.hold(id, psDrop);
      part_system_colour(fx, color, 1);
      matrix_set(matrix_world, matrix_build(p.x, p.y, 0, tilt, 0, 0, 1, 1, 1));
      part_system_drawit(fx);
      matrix_set(matrix_world, ident);
    });
    // Beacons: the site's travel prop streams psPortal for as long as it stands, held by entity
    // id like a drop. The asset is authored over the beacon sprite's SOURCE frame (128 px), so it
    // draws at the sprite's baked scale, on the same camera-facing plane.
    entities.forEach([Interaction, Visual, Position], (id, it, vis, p) => {
      if (it.kind !== "travel") return;
      const fx = ParticleFx.hold(id, psPortal);
      const k = Math.abs(vis.xscale);
      matrix_set(matrix_world, matrix_build(p.x, p.y, 0, tilt, 0, 0, k, k, 1));
      part_system_drawit(fx);
      matrix_set(matrix_world, ident);
    });
    ParticleFx.sweep((id) => {
      if (entities.has(id, ItemDrop)) return true;
      const it = entities.get(id, Interaction);
      if (it === undefined) return false;
      return it.kind === "travel";
    });

    // 2.5D: lift in-air cues (projectile dots + tracers) off the ground via a world-z offset so they
    // read as flying. Depth-test off so a body they pass can't hide them (transient, always visible).
    // Flat top-down (pitch 0) lifts nothing.
    const lift = pitch !== 0 ? 32 : 0;
    if (lift !== 0) {
      gpu_set_ztestenable(false);
      matrix_set(matrix_world, matrix_build(0, 0, -lift, 0, 0, 0, 1, 1, 1));
    }
    // Projectile entities: a fused charge (grenade) as its icon, a bullet as a round dot (none while
    // guns are hitscan — the path stays for ProjectileSystem).
    draw_set_color(make_colour_rgb(255, 230, 90));
    entities.forEach([Projectile, Position], (id, _proj, p) => {
      if (entities.has(id, Fuse))
        draw_sprite_ext(pixItemGrenade, 0, p.x, p.y, 1, 1, 0, c_white, 1);
      else draw_circle(p.x, p.y, 4, false);
    });
    // Hitscan tracers: a fading muzzle->impact streak aged on Time.raw.
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
    if (scene.map.reachZone !== undefined && !scene.map.reachDone) {
      const z = scene.map.reachZone;
      draw_set_alpha(0.35);
      draw_set_color(make_colour_rgb(120, 200, 255));
      draw_rectangle(z.x1, z.y1, z.x2, z.y2, false);
      draw_set_alpha(1);
    }
    draw_set_color(c_white);
  },
};

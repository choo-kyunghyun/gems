// World-space gameplay overlay for the TopDown RPG demo: walls, item drops, bullets,
// and the reach-quest zone, drawn in world space in scene.draw(). The HUD / dialogue /
// inventory are now real UI panels built by the scene and drawn by the UI manager on
// the GUI layer (Draw_75) — they no longer live here. `_rarityColor` is shared by the
// drops below and the scene's inventory window rows.
globalThis.TopDownUI = {
  _rarityColor(itemId) {
    const it = Item.get(itemId);
    const r = it !== undefined ? Rarity.get(it.rarity) : undefined;
    return r !== undefined ? r.color : c_white;
  },

  // World-space markers: walls, item drops (rarity squares), bullets (dots), reach zone.
  drawWorld(scene) {
    const world = scene.world;

    // Walls = kinematic solids with no Visual (NPC/enemies have a Visual).
    const solids = world.query(Collision, BBox, Position);
    draw_set_color(make_colour_rgb(70, 74, 90));
    for (const id of solids) {
      const col = world.get(Collision, id);
      if (!col.solid || !col.kinematic) continue;
      if (world.get(Visual, id) !== undefined) continue;
      const e = AABB.of(world, id);
      draw_rectangle(e.x1, e.y1, e.x2, e.y2, false);
    }

    const drops = world.query(ItemDrop, Position);
    for (const id of drops) {
      const p = world.get(Position, id);
      const d = world.get(ItemDrop, id);
      draw_set_color(this._rarityColor(d.itemId));
      draw_rectangle(p.x - 7, p.y - 7, p.x + 7, p.y + 7, false);
      draw_set_color(c_black);
      draw_rectangle(p.x - 7, p.y - 7, p.x + 7, p.y + 7, true);
    }

    const bullets = world.query(Projectile, Position);
    draw_set_color(make_colour_rgb(255, 230, 90));
    for (const id of bullets) {
      const p = world.get(Position, id);
      draw_circle(p.x, p.y, 3, false);
    }

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

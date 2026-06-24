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

  drawWorld(scene) {
    const world = scene.world;

    const drops = world.query(ItemDrop, Position);
    for (const id of drops) {
      const p = world.get(Position, id);
      const d = world.get(ItemDrop, id);
      draw_set_color(this._rarityColor(d.itemId));
      draw_rectangle(p.x - 4, p.y - 4, p.x + 4, p.y + 4, false);
      draw_set_color(c_black);
      draw_rectangle(p.x - 4, p.y - 4, p.x + 4, p.y + 4, true);
    }

    const bullets = world.query(Projectile, Position);
    draw_set_color(make_colour_rgb(255, 230, 90));
    for (const id of bullets) {
      const p = world.get(Position, id);
      draw_circle(p.x, p.y, 2, false);
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

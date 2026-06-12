// World-space gameplay overlay for the platformer RPG demo: item drops (rarity
// squares) + bullets (dots), drawn in world space in scene.draw(). The HUD and the
// inventory are now real UI panels built by the scene and drawn by the UI manager on
// the GUI layer (Draw_75) — they no longer live here. `_rarityColor` is shared by the
// drops below and the scene's inventory window rows.
globalThis.PlatformerUI = {
  _rarityColor(itemId) {
    const it = Item.get(itemId);
    const r = it !== undefined ? Rarity.get(it.rarity) : undefined;
    return r !== undefined ? r.color : c_white;
  },

  // World-space markers: item drops (rarity squares) + bullets (dots).
  drawWorld(scene) {
    const world = scene.world;

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
    draw_set_color(c_white);
  },
};

/**
 * Colored-box stand-in renderer: draws each entity as a filled `Visual.color`
 * rectangle (GMRT 0.19 can't render the SVG character sprites) plus its `Name`
 * label. Pair it with `RenderDebugEntity` inserted *after* for the lime bbox
 * overlay on top. Position is interpolated via `PrevPosition` + `world.alpha`
 * like `RenderEntity`/`RenderDebugEntity`.
 * @implements {RenderPass}
 */
globalThis.RenderDebugBox = class RenderDebugBox {
  destroy() {}

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();

    const ids = world.query(Position);

    // Filled boxes: Visual.color fill + black outline, for entities with a Visual + BBox.
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const vis = world.get(Visual, id);
      if (vis === undefined || !vis.visible) continue;
      const box = world.get(BBox, id);
      if (box === undefined) continue;

      const pos = world.get(Position, id);
      const prev = world.get(PrevPosition, id);
      const cx =
        prev !== undefined ? prev.x + (pos.x - prev.x) * world.alpha : pos.x;
      const cy =
        prev !== undefined ? prev.y + (pos.y - prev.y) * world.alpha : pos.y;

      // Animator pulse (topdown polish): inflate the box on attack/walk states.
      const anim = world.get(Animator, id);
      let inflate = 0;
      if (anim !== undefined) {
        if (anim.state === "attack") inflate = 3;
        else if (anim.state === "walk") inflate = 1;
      }
      const x1 = cx + box.x - inflate;
      const y1 = cy + box.y - inflate;
      const x2 = cx + box.x + box.width + inflate;
      const y2 = cy + box.y + box.height + inflate;

      draw_set_alpha(vis.alpha);
      draw_set_color(vis.color);
      draw_rectangle(x1, y1, x2, y2, false);
      draw_set_alpha(1);
      draw_set_color(c_black);
      draw_rectangle(x1, y1, x2, y2, true);

      // Facing dot, when the entity carries a Direction.
      const dir = world.get(Direction, id);
      if (dir !== undefined && (dir.x !== 0 || dir.y !== 0)) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const r = (x2 - x1) / 2;
        draw_circle(mx + dir.x * r * 0.6, my + dir.y * r * 0.6, 3, false);
      }
    }

    // Name labels: centered above the box, for any entity with a Name.
    draw_set_alpha(1);
    draw_set_color(c_white);
    draw_set_halign(fa_center);
    draw_set_valign(fa_bottom);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const name = world.get(Name, id);
      if (name === undefined) continue;
      const pos = world.get(Position, id);
      const prev = world.get(PrevPosition, id);
      const rx =
        prev !== undefined ? prev.x + (pos.x - prev.x) * world.alpha : pos.x;
      const ry =
        prev !== undefined ? prev.y + (pos.y - prev.y) * world.alpha : pos.y;
      const bbox = world.get(BBox, id);
      const offsetY = bbox !== undefined ? bbox.y : 0;
      draw_text(rx, ry + offsetY, name.name);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};

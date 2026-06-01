/** @implements {RenderPass} */
globalThis.RenderDebugPath = class RenderDebugPath {
  constructor(level) {
    this.level = level;
  }

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const level = this.level;

    draw_set_alpha(1);

    for (const id of world.query(PathResponse)) {
      const pr = world.get(PathResponse, id);
      const { path } = pr;
      if (path.length === 0) continue;

      draw_set_color(c_yellow);
      for (let i = 1; i < path.length; i++) {
        const a = level.gridToWorld(path[i - 1].x, path[i - 1].y);
        const b = level.gridToWorld(path[i].x, path[i].y);
        draw_line(a.x, a.y, b.x, b.y);
      }

      const pos = world.get(Position, id);
      if (pos !== undefined) {
        const w0 = level.gridToWorld(path[0].x, path[0].y);
        draw_set_color(c_orange);
        draw_line(pos.x, pos.y, w0.x, w0.y);
      }
    }

    for (const id of world.query(PathRequest)) {
      const req = world.get(PathRequest, id);
      const wp = level.gridToWorld(req.goalX, req.goalY);
      draw_set_color(c_red);
      draw_line(wp.x - 4, wp.y - 4, wp.x + 4, wp.y + 4);
      draw_line(wp.x + 4, wp.y - 4, wp.x - 4, wp.y + 4);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};

/**
 * pathfinding overlay: PathResponse routes (yellow + orange leader), PathRequest goals (red cross).
 * @implements {RenderPass}
 */
globalThis.RenderDebugPath = class RenderDebugPath {
  constructor(grid) {
    this.enabled = true;
    this.grid = grid;
  }

  destroy() {}

  draw(entities) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const grid = this.grid;

    draw_set_alpha(1);

    for (const id of entities.query(PathResponse)) {
      const pr = entities.get(id, PathResponse);
      const { path } = pr;
      if (path.length === 0) continue;

      draw_set_color(c_yellow);
      for (let i = 1; i < path.length; i++) {
        const a = grid.gridToWorld(path[i - 1].x, path[i - 1].y);
        const b = grid.gridToWorld(path[i].x, path[i].y);
        draw_line(a.x, a.y, b.x, b.y);
      }

      const pos = entities.get(id, Position);
      if (pos !== undefined) {
        const w0 = grid.gridToWorld(path[0].x, path[0].y);
        draw_set_color(c_orange);
        draw_line(pos.x, pos.y, w0.x, w0.y);
      }
    }

    for (const id of entities.query(PathRequest)) {
      const req = entities.get(id, PathRequest);
      const wp = grid.gridToWorld(req.goalX, req.goalY);
      draw_set_color(c_red);
      draw_line(wp.x - 4, wp.y - 4, wp.x + 4, wp.y + 4);
      draw_line(wp.x + 4, wp.y - 4, wp.x - 4, wp.y + 4);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};

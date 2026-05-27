/** @implements {RenderPass} */
globalThis.RenderDebugPath = class RenderDebugPath {
  constructor(world) {
    this.world = world;
  }

  draw() {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const world = this.world;

    draw_set_alpha(1);

    for (let index = 0; index < PathResponse.data.length; index++) {
      const path = PathResponse.data[index];
      if (path === undefined || path.length === 0) continue;

      draw_set_color(c_yellow);
      for (let i = 1; i < path.length; i++) {
        const a = world.gridToWorld(path[i - 1].x, path[i - 1].y);
        const b = world.gridToWorld(path[i].x, path[i].y);
        draw_line(a.x, a.y, b.x, b.y);
      }

      const pos = Position.data[index];
      if (pos !== undefined) {
        const w0 = world.gridToWorld(path[0].x, path[0].y);
        draw_set_color(c_orange);
        draw_line(pos.x, pos.y, w0.x, w0.y);
      }
    }

    for (let index = 0; index < PathRequest.data.length; index++) {
      const req = PathRequest.data[index];
      if (req === undefined) continue;

      const wp = world.gridToWorld(req.gx, req.gy);
      draw_set_color(c_red);
      draw_line(wp.x - 4, wp.y - 4, wp.x + 4, wp.y + 4);
      draw_line(wp.x + 4, wp.y - 4, wp.x - 4, wp.y + 4);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};

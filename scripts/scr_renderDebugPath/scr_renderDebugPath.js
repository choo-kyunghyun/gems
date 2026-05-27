/** @implements {RenderPass} */
globalThis.RenderDebugPath = class RenderDebugPath {
  draw() {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    draw_set_alpha(1);

    for (let index = 0; index < PathResponse.data.length; index++) {
      const path = PathResponse.data[index];
      if (path === undefined || path.length === 0) continue;

      draw_set_color(c_yellow);
      for (let i = 1; i < path.length; i++) {
        draw_line(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
      }

      const pos = Position.data[index];
      if (pos !== undefined) {
        draw_set_color(c_orange);
        draw_line(pos.x, pos.y, path[0].x, path[0].y);
      }
    }

    for (let index = 0; index < PathRequest.data.length; index++) {
      const req = PathRequest.data[index];
      if (req === undefined) continue;

      draw_set_color(c_red);
      draw_line(req.x - 4, req.y - 4, req.x + 4, req.y + 4);
      draw_line(req.x + 4, req.y - 4, req.x - 4, req.y + 4);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};

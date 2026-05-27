draw_clear(this.colBackground);

const cw = this.world.cellWidth;
const ch = this.world.cellHeight;

for (let y = 0; y < this.world.rows; y++) {
  for (let x = 0; x < this.world.cols; x++) {
    const cost = this.world.mpg.get(x, y);
    if (cost === Infinity) {
      draw_set_color(this.colWall);
      draw_rectangle(x * cw, y * ch, x * cw + cw, y * ch + ch, false);
    }
    draw_set_color(this.colGrid);
    draw_rectangle(x * cw, y * ch, x * cw + cw, y * ch + ch, true);
  }
}

const path = PathResponse.get(this.player);
if (path !== undefined && path.length > 0) {
  draw_set_color(c_yellow);
  for (let i = 1; i < path.length; i++) {
    const a = this.world.gridToWorld(path[i - 1].x, path[i - 1].y);
    const b = this.world.gridToWorld(path[i].x, path[i].y);
    draw_line(a.x, a.y, b.x, b.y);
  }
  const goal = this.world.gridToWorld(
    path[path.length - 1].x,
    path[path.length - 1].y,
  );
  draw_set_color(c_red);
  draw_circle(goal.x, goal.y, 6, true);
}

const wp = PathCursor.current(this.player);
if (wp !== undefined) {
  const wpw = this.world.gridToWorld(wp.x, wp.y);
  draw_set_color(c_lime);
  draw_circle(wpw.x, wpw.y, 5, true);
}

this.renderer.draw();

draw_set_color(c_white);
draw_set_halign(fa_left);
draw_set_valign(fa_top);

const sm = State.data[IdPool.getIndex(this.player)];
const pos = Position.get(this.player);
const gc = pos !== undefined ? this.world.worldToGrid(pos.x, pos.y) : undefined;

draw_text(
  4,
  4,
  "State : " + (sm !== undefined ? (sm.current ?? "none") : "none"),
);
draw_text(
  4,
  48,
  "Grid  : " + (gc !== undefined ? "(" + gc.x + ", " + gc.y + ")" : "-"),
);

global.TerrainDebugPass = class TerrainDebugPass extends WorldRenderPass {
  draw(world, camera) {
    const cw = world.cell_width;
    const ch = world.cell_height;
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (world.mpg.is_blocked(x, y)) continue;
        draw_set_color("#4d514a");
        draw_rectangle(x * cw, y * ch, (x + 1) * cw, (y + 1) * ch, false);
      }
    }
  }
};

global.ActorDebugPass = class ActorDebugPass extends WorldRenderPass {
  draw(world, camera) {
    const color = draw_get_color();

    draw_set_color("#ab9a90");
    const actors = world.actor_manager.items();
    const actor_count = actors.length;
    for (const actor of actors) {
      const demo = actor.properties.demo_simgame;
      const x = actor.x;
      const y = actor.y;
      if (typeof demo === "object" && demo !== undefined) {
        const goal_cell = demo.goal_cell;
        if (typeof goal_cell === "object" && goal_cell !== undefined) {
          const goal_px =
            goal_cell.x * world.cell_width + world.cell_width * 0.5;
          const goal_py =
            goal_cell.y * world.cell_height + world.cell_height * 0.5;
          draw_set_color("#f9d061");
          draw_circle(goal_px, goal_py, 4, false);
          draw_line(x, y, goal_px, goal_py);
        }
      }

      const next = world.mp.get_next_cell(actor.id);
      if (typeof next === "object" && next !== undefined) {
        const next_px = next.x * world.cell_width + world.cell_width * 0.5;
        const next_py = next.y * world.cell_height + world.cell_height * 0.5;
        draw_set_color("#f6bbad");
        draw_circle(next_px, next_py, 3, false);
      }

      draw_set_color("#ab9a90");
      draw_circle(x, y, 6, false);
    }

    draw_set_color(color);
  }
};

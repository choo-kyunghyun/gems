function ActorDebugPass() : WorldRenderPass() constructor {
	static draw = function(_world, _camera) {
		if (!is_struct(_world)) return;

		draw_set_color(#ab9a90);
		var _actors = _world.actor_manager.items();
		var _actor_count = array_length(_actors);
		for (var _i = 0; _i < _actor_count; _i++) {
			var _actor = _actors[_i];
			var _demo = _actor.properties[$ "demo_simgame"];
			var _ax = _actor.x;
			var _ay = _actor.y;
			if (is_struct(_demo)) {
				var _goal_cell = _demo[$ "goal_cell"];
				if (is_struct(_goal_cell)) {
					var _goal_px = _goal_cell.x * _world.cell_width + _world.cell_width * 0.5;
					var _goal_py = _goal_cell.y * _world.cell_height + _world.cell_height * 0.5;
					draw_set_color(#f9d061);
					draw_circle(_goal_px, _goal_py, 4, false);
					draw_line(_ax, _ay, _goal_px, _goal_py);
				}
			}

			var _next = _world.mp.get_next_cell(_actor.id);
			if (is_struct(_next)) {
				var _next_px = _next.x * _world.cell_width + _world.cell_width * 0.5;
				var _next_py = _next.y * _world.cell_height + _world.cell_height * 0.5;
				draw_set_color(#f6bbad);
				draw_circle(_next_px, _next_py, 3, false);
			}

			draw_set_color(#ab9a90);
			draw_circle(_ax, _ay, 6, false);
		}
	}
}

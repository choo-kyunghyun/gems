function ActorDebugPass() : WorldRenderPass() constructor {
	static draw = function(_world, _camera) {
		if (!is_struct(_world)) return;

		draw_set_colour(ASTOLFO_WHITE_D);
		var _actors = _world.actor_manager.items();
		var _actor_count = array_length(_actors);
		for (var _i = 0; _i < _actor_count; _i++) {
			var _actor = _actors[_i];
			var _demo = _actor.properties[$ "demo_simgame"];
			var _ax = _actor.x;
			var _ay = _actor.y;
			var _aid = _actor.id;
			if (is_struct(_demo)) {
				var _goal_cell = _demo[$ "goal_cell"];
				if (is_struct(_goal_cell)) {
					var _goal_col = variable_struct_get(_goal_cell, "x");
					var _goal_row = variable_struct_get(_goal_cell, "y");
					var _goal_px = _goal_col * _world.cell_width + _world.cell_width * 0.5;
					var _goal_py = _goal_row * _world.cell_height + _world.cell_height * 0.5;
					draw_set_colour(ASTOLFO_GOLD);
					draw_circle(_goal_px, _goal_py, 4, false);
					draw_line(_ax, _ay, _goal_px, _goal_py);
				}
			}

			var _next = _world.mp.get_next_cell(_aid);
			if (is_struct(_next)) {
				var _next_col = variable_struct_get(_next, "x");
				var _next_row = variable_struct_get(_next, "y");
				var _next_px = _next_col * _world.cell_width + _world.cell_width * 0.5;
				var _next_py = _next_row * _world.cell_height + _world.cell_height * 0.5;
				draw_set_colour(ASTOLFO_PINK);
				draw_circle(_next_px, _next_py, 3, false);
			}

			draw_set_colour(ASTOLFO_WHITE_D);
			draw_circle(_ax, _ay, 6, false);
		}
	}
}

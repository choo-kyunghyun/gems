/// Draw Event

// Inherit the parent event
event_inherited();

if (is_struct(self.world)) {
	var _cw = self.world.cell_width;
	var _ch = self.world.cell_height;
	for (var _y = 0; _y < self.world.height; _y++) {
		for (var _x = 0; _x < self.world.width; _x++) {
			if (self.world.mpg.is_blocked(_x, _y)) {
				draw_set_colour(ASTOLFO_BLACK);
				draw_rectangle(_x * _cw, _y * _ch, (_x + 1) * _cw, (_y + 1) * _ch, false);
			}
		}
	}

	draw_set_colour(ASTOLFO_WHITE_D);
	var _actors = self.world.actor_manager.items();
	var _actor_count = array_length(_actors);
	for (var _i = 0; _i < _actor_count; _i++) {
		var _actor = _actors[_i];
		var _demo = self.actor_demo(_actor);
		var _ax = _actor.x;
		var _ay = _actor.y;
		var _aid = variable_struct_get(_actor, "id");
		var _goal_cell = _demo[$ "goal_cell"];
		if (is_struct(_goal_cell)) {
			var _goal_col = variable_struct_get(_goal_cell, "x");
			var _goal_row = variable_struct_get(_goal_cell, "y");
			var _goal_px = _goal_col * self.world.cell_width + self.world.cell_width * 0.5;
			var _goal_py = _goal_row * self.world.cell_height + self.world.cell_height * 0.5;
			draw_set_colour(ASTOLFO_GOLD);
			draw_circle(_goal_px, _goal_py, 4, false);
			draw_line(_ax, _ay, _goal_px, _goal_py);
		}

		var _next = self.world.mp.get_next_cell(_aid);
		if (is_struct(_next)) {
			var _next_col = variable_struct_get(_next, "x");
			var _next_row = variable_struct_get(_next, "y");
			var _next_px = _next_col * self.world.cell_width + self.world.cell_width * 0.5;
			var _next_py = _next_row * self.world.cell_height + self.world.cell_height * 0.5;
			draw_set_colour(ASTOLFO_PINK);
			draw_circle(_next_px, _next_py, 3, false);
		}

		draw_set_colour(ASTOLFO_WHITE_D);
		draw_circle(_ax, _ay, 6, false);
	}
}



function TerrainDebugPass() : WorldRenderPass() constructor {
	static draw = function(_world, _camera) {
		if (!is_struct(_world)) return;

		var _cw = _world.cell_width;
		var _ch = _world.cell_height;
		for (var _y = 0; _y < _world.height; _y++) {
			for (var _x = 0; _x < _world.width; _x++) {
				if (!_world.mpg.is_blocked(_x, _y)) continue;
				draw_set_color(ASTOLFO_BLACK);
				draw_rectangle(_x * _cw, _y * _ch, (_x + 1) * _cw, (_y + 1) * _ch, false);
			}
		}
	}
}

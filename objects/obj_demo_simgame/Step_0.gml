/// Step Event

// Inherit the parent event
event_inherited();

if (is_struct(self.world)) self.world.update();

if (keyboard_check_pressed(ord("Q"))) self.spawn_actors(10);
if (keyboard_check_pressed(ord("E"))) self.despawn_actors(10);
if (keyboard_check_pressed(ord("R"))) self.rebuild_obstacles();
if (keyboard_check_pressed(ord("C"))) self.camera_follow = !self.camera_follow;

var _wheel = mouse_wheel_down() - mouse_wheel_up();
if (_wheel != 0) self.camera.look_distance += _wheel * 16;

var _dt = delta_time / 1000000;

if (is_struct(self.camera) && !self.camera_follow) {
	var _cx = self.camera.from_x;
	var _cy = self.camera.from_y;
	if (keyboard_check(vk_left) || keyboard_check(ord("A"))) _cx -= self.camera_pan_speed * _dt;
	if (keyboard_check(vk_right) || keyboard_check(ord("D"))) _cx += self.camera_pan_speed * _dt;
	if (keyboard_check(vk_up) || keyboard_check(ord("W"))) _cy -= self.camera_pan_speed * _dt;
	if (keyboard_check(vk_down) || keyboard_check(ord("S"))) _cy += self.camera_pan_speed * _dt;
	self.camera.set_from(_cx, _cy, -self.camera.look_distance);
	self.camera.set_to(_cx, _cy, 0);
}

if (is_struct(self.world)) {
	self.active_count = 0;
	self.lod_count = 0;

	var _cam_l = self.camera.from_x - self.camera.width * 0.5 - self.lod_margin;
	var _cam_r = self.camera.from_x + self.camera.width * 0.5 + self.lod_margin;
	var _cam_t = self.camera.from_y - self.camera.height * 0.5 - self.lod_margin;
	var _cam_b = self.camera.from_y + self.camera.height * 0.5 + self.lod_margin;
	var _actors = self.world.actor_manager.items();
	var _actor_count = array_length(_actors);

	for (var _i = 0; _i < _actor_count; _i++) {
		var _actor = _actors[_i];
		var _demo = self.actor_demo(_actor);
		var _ax = _actor.x;
		var _ay = _actor.y;
		var _in_view = (_ax >= _cam_l && _ax <= _cam_r && _ay >= _cam_t && _ay <= _cam_b);
		self.world.actor_manager.set_instantiated(_actor, _in_view);

		if (_actor.is_instantiated()) self.active_count++; else self.lod_count++;

		var _do_logic = _actor.is_instantiated() || (self.world.tick mod _demo[$ "lod_skip"] == 0);
		if (!_do_logic) continue;

		var _req = self.world.mp.get_request(_actor.id);
		var _need_plan = !is_struct(_req)
			|| (array_length(_req[$ "path"]) == 0)
			|| (_req[$ "version"] != self.world.nav_version);
		if (_need_plan) self.request_actor_path(_actor);

		var _next = self.world.mp.get_next_cell(_actor.id);
		if (!is_struct(_next)) {
			_demo[$ "goal_cell"] = self.random_open_cell();
			self.request_actor_path(_actor);
			continue;
		}

		var _nx = variable_struct_get(_next, "x");
		var _ny = variable_struct_get(_next, "y");
		var _tx = _nx * self.world.cell_width + self.world.cell_width * 0.5;
		var _ty = _ny * self.world.cell_height + self.world.cell_height * 0.5;
		var _cx = _actor.x;
		var _cy = _actor.y;
		var _dx = _tx - _cx;
		var _dy = _ty - _cy;
		var _dist = point_distance(0, 0, _dx, _dy);
		var _step = self.actor_speed * _dt;

		if (_dist <= max(2, _step)) {
			_actor.set_position(_tx, _ty);
			self.world.mp.get_next_cell(_actor.id, true);
			if (!is_struct(self.world.mp.get_next_cell(_actor.id))) {
				_demo[$ "goal_cell"] = self.random_open_cell();
				self.request_actor_path(_actor);
			}
		} else {
			_actor.set_position(_cx + _dx / _dist * _step, _cy + _dy / _dist * _step);
		}
	}

	if (is_struct(self.camera) && self.camera_follow && _actor_count > 0) {
		var _lead = _actors[0];
		self.world.actor_manager.set_instantiated(_lead, true);
		self.camera.follow_target = _lead.instance;
	}

	self.camera.from_z = -self.camera.look_distance;
	self.camera.to_z = self.camera.from_z + self.camera.look_distance;
	self.camera.update();
}



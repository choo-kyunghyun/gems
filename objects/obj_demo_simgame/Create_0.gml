/// Create Event

// Inherit the parent event
event_inherited();

self.world = new World();

self.camera = new CameraFollow();
self.camera.set_size(room_width, room_height);
self.camera.set_from(room_width * 0.5, room_height * 0.5, -self.camera.look_distance);
self.camera.set_to(room_width * 0.5, room_height * 0.5, 0);
self.camera.assign(0);

self.world_renderer = new WorldRenderer();
self.world_renderer.add(new TerrainDebugPass());
self.world_renderer.add(new ActorDebugPass());

self.camera_follow = true;
self.camera_pan_speed = 400;
self.lod_margin = 48;
self.active_count = 0;
self.lod_count = 0;
self.actor_speed = 120;
self.obstacle_rate = 0.18;
self.level_actor_count = 20;

self.make_actor = function(_x, _y) {
	var _a = new Actor();
	_a.name = $"Actor#{irandom(999999)}";
	_a.x = _x;
	_a.y = _y;
	_a.z = 0;
	_a.properties[$ "demo_simgame"] = {
		goal_cell: undefined,
		last_plan_tick: -1,
		lod_skip: 8,
	};
	_a.state_machine.add_state("active", new State(undefined, undefined, undefined, undefined, {
		state_despawn: "lod",
	}));
	_a.state_machine.add_state("lod", new State(undefined, undefined, undefined, undefined, {
		state_spawn: "active",
	}));
	_a.state_machine.change_state("lod", true);
	_a.state_machine.update();
	return _a;
}

self.build_level_data = function(_actor_count) {
	var _actors = [];
	for (var _i = 0; _i < _actor_count; _i++) {
		var _x = irandom_range(64, display_get_gui_width() - 256);
		var _y = irandom_range(96, display_get_gui_height() - 64);
		array_push(_actors, self.make_actor(_x, _y));
	}

	return {
		cell_width: 32,
		cell_height: 32,
		actors: _actors,
	};
}

self.actor_demo = function(_actor) {
	var _demo = _actor.properties[$ "demo_simgame"];
	if (!is_struct(_demo)) {
		_demo = {
			goal_cell: undefined,
			last_plan_tick: -1,
			lod_skip: 8,
		};
		_actor.properties[$ "demo_simgame"] = _demo;
	}
	return _demo;
}

self.cell_center = function(_cx, _cy) {
	return {
		x: _cx * self.world.cell_width + self.world.cell_width * 0.5,
		y: _cy * self.world.cell_height + self.world.cell_height * 0.5,
	};
}

self.to_cell = function(_x, _y) {
	return {
		x: clamp(_x div self.world.cell_width, 0, self.world.width - 1),
		y: clamp(_y div self.world.cell_height, 0, self.world.height - 1),
	};
}

self.is_cell_blocked = function(_x, _y) {
	return self.world.mpg.is_blocked(_x, _y);
}

self.random_open_cell = function() {
	for (var _i = 0; _i < 128; _i++) {
		var _x = irandom(self.world.width - 1);
		var _y = irandom(self.world.height - 1);
		if (!self.is_cell_blocked(_x, _y)) return { x: _x, y: _y };
	}
	return { x: 0, y: 0 };
}

self.rebuild_obstacles = function() {
	for (var _y = 0; _y < self.world.height; _y++) {
		for (var _x = 0; _x < self.world.width; _x++) {
			var _edge = (_x == 0 || _y == 0 || _x == self.world.width - 1 || _y == self.world.height - 1);
			var _blocked = _edge || random(1) < self.obstacle_rate;
			self.world.terrain.set_cell(_x, _y, _blocked ? 1 : 0);
			self.world.mpg.set_cell(_x, _y, 1, _blocked);
		}
	}

	var _actors = self.world.actor_manager.items();
	var _actor_count = array_length(_actors);
	for (var _i = 0; _i < _actor_count; _i++) {
		var _actor = _actors[_i];
		var _cell = self.to_cell(_actor.x, _actor.y);
		self.world.mpg.set_blocked(_cell.x, _cell.y, false);
	}

	self.world.mark_nav_dirty();
}

self.request_actor_path = function(_actor) {
	var _demo = self.actor_demo(_actor);
	var _start = self.to_cell(_actor.x, _actor.y);
	self.world.mpg.set_blocked(_start.x, _start.y, false);

	if (!is_struct(_demo[$ "goal_cell"]) || self.is_cell_blocked(_demo[$ "goal_cell"][$ "x"], _demo[$ "goal_cell"][$ "y"])) {
		_demo[$ "goal_cell"] = self.random_open_cell();
	}

	var _req = self.world.mp.request_path(_actor.id, _start, _demo[$ "goal_cell"], {
		allow_diagonal: true,
		corner_cutting: false,
		heuristic_weight: 1,
		max_iter: 20000,
	});
	_demo[$ "last_plan_tick"] = self.world.tick;

	if (array_length(_req[$ "path"]) == 0) {
		_demo[$ "goal_cell"] = self.random_open_cell();
		self.world.mp.request_path(_actor.id, _start, _demo[$ "goal_cell"], {
			allow_diagonal: true,
			corner_cutting: false,
			heuristic_weight: 1,
			max_iter: 20000,
		});
	}
}

self.spawn_actors = function(_count) {
	for (var _i = 0; _i < _count; _i++) {
		var _x = irandom_range(64, display_get_gui_width() - 256);
		var _y = irandom_range(96, display_get_gui_height() - 64);
		self.world.actor_manager.add(self.make_actor(_x, _y));
	}
}

self.despawn_actors = function(_count) {
	var _n = min(_count, self.world.actor_manager.count());
	var _actors = self.world.actor_manager.items();
	for (var _i = 0; _i < _n; _i++) {
		var _actor = _actors[array_length(_actors) - 1 - _i];
		self.world.actor_manager.queue_remove(_actor);
	}
}

self.world.load_level(self.build_level_data(self.level_actor_count));
self.rebuild_obstacles();

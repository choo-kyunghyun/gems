function MotionPlanning(_grid) constructor {
	self.planner = new MotionPlanner(_grid);
	self.requests = {};
	self.version = 0;

	static set_grid = function(_grid) {
		self.planner.set_grid(_grid);
		self.requests = {};
	}

	static set_version = function(_version) {
		self.version = _version;
	}

	static request_path = function(_actor_id, _start, _goal, _opt = {}) {
		var _path = self.planner.plan(_start, _goal, MP_ALGORITHM.ASTAR, _opt);
		var _request = {
			start: _start,
			goal: _goal,
			path: _path,
			index: 0,
			version: self.version,
		};
		self.requests[$ _actor_id] = _request;
		return _request;
	}

	static get_request = function(_actor_id) {
		return self.requests[$ _actor_id];
	}

	static remove_request = function(_actor_id) {
		struct_remove(self.requests, _actor_id);
	}

	static get_next_cell = function(_actor_id, _consume = false) {
		var _req = self.get_request(_actor_id);
		if (_req == undefined) return undefined;
		var _len = array_length(_req.path);
		if (_req.index >= _len) {
			self.remove_request(_actor_id);
			return undefined;
		}
		var _cell = _req.path[_req.index];
		if (_consume && ++_req.index >= _len) self.remove_request(_actor_id);
		return _cell;
	}
}

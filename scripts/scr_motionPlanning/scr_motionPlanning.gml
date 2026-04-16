function MotionPlanning(_grid) constructor {
	self.planner = new MotionPlanner(_grid);
	self.requests = {};
	self.version = 0;

	static set_grid = function(_grid) {
		self.planner.set_grid(_grid);
		self.requests = {};
	}

	static reset = function(_grid = undefined) {
		if (_grid != undefined) self.planner.set_grid(_grid);
		self.requests = {};
		self.version = 0;
	}

	static get_version = function() {
		return self.version;
	}

	static increase_version = function() {
		self.version++;
		return self.version;
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

	static count_requests = function() {
		return array_length(struct_get_names(self.requests));
	}

	static needs_replan = function(_actor_id) {
		var _req = self.get_request(_actor_id);
		if (!is_struct(_req)) return true;
		if (array_length(_req[$ "path"]) == 0) return true;
		return _req[$ "version"] != self.version;
	}

	static remove_request = function(_actor_id) {
		struct_remove(self.requests, _actor_id);
	}

	static get_next_cell = function(_actor_id, _consume = false) {
		var _req = self.get_request(_actor_id);
		if (_req == undefined) return undefined;
		var _path = variable_struct_get(_req, "path");
		var _index = variable_struct_get(_req, "index");
		var _len = array_length(_path);
		if (_index >= _len) {
			self.remove_request(_actor_id);
			return undefined;
		}
		var _cell = _path[_index];
		if (_consume) {
			_index++;
			variable_struct_set(_req, "index", _index);
			if (_index >= _len) self.remove_request(_actor_id);
		}
		return _cell;
	}
}

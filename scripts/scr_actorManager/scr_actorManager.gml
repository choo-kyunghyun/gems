function ActorManager(_world) constructor {
	self.world = _world;
	self.actors = [];
	self.pending_removals = [];

    static destroy = function() {
		self.clear();
	}

    static import = function(_actors_state) {
		self.clear();

		for (var _i = 0; _i < array_length(_actors_state); _i++) {
			var _actor_data = _actors_state[_i];
			if (!is_struct(_actor_data)) continue;

			var _actor = new Actor(_actor_data);
			_actor.world = self.world;
			array_push(self.actors, _actor);
		}

		return self;
	}

	static export = function() {
		var _actors_state = [];
		for (var _i = 0; _i < array_length(self.actors); _i++) {
			array_push(_actors_state, self.actors[_i].export());
		}
		return _actors_state;
	}

	static count = function() {
		return array_length(self.actors);
	}

	static items = function() {
		return self.actors;
	}

	static at = function(_index) {
		if (_index < 0 || _index >= array_length(self.actors)) return undefined;
		return self.actors[_index];
	}

    static clear = function() {
		for (var _i = array_length(self.actors) - 1; _i >= 0; _i--) {
			var _actor = self.actors[_i];
			_actor.despawn();
			_actor.world = undefined;
		}

		self.actors = [];
		self.pending_removals = [];
	}

	static _index_of_id = function(_id) {
		var _target_id = string(_id);
		for (var _i = 0; _i < array_length(self.actors); _i++) {
			var _actor = self.actors[_i];
			if (_actor.id == _target_id) return _i;
		}
		return -1;
	}

	static add = function(_actor) {
		if (!is_struct(_actor)) return false;

		_actor.world = self.world;
		array_push(self.actors, _actor);
		return true;
	}

	static queue_remove = function(_actor_or_id) {
		var _actor = undefined;
		if (is_struct(_actor_or_id)) {
			_actor = _actor_or_id;
		} else {
			var _index = self._index_of_id(_actor_or_id);
			if (_index >= 0) _actor = self.actors[_index];
		}

		if (!is_struct(_actor)) return false;
		array_push(self.pending_removals, _actor);
		return true;
	}

	static flush_pending_removals = function() {
		for (var _i = 0; _i < array_length(self.pending_removals); _i++) {
			var _actor = self.pending_removals[_i];
			var _id = _actor.id;
			var _index = self._index_of_id(_id);

			_actor.despawn();
			_actor.world = undefined;
			array_delete(self.actors, _index, 1);
			self.world.mp.remove_request(_id);
		}

		self.pending_removals = [];
	}

	static update = function() {
		for (var _i = 0; _i < array_length(self.actors); _i++) {
			self.actors[_i].update();
		}
	}

	static draw = function() {
		for (var _i = 0; _i < array_length(self.actors); _i++) {
			self.actors[_i].draw();
		}
	}
}

new UIManager();

function UIManager() constructor {
	static roots = [];
	static pointer_router = new UIPointerRouter();

	static _index_of = function(_root_id) {
		for (var _i = 0; _i < array_length(self.roots); _i++) {
			if (self.roots[_i].id == _root_id) return _i;
		}
		return -1;
	}

	static _sync_router = function() {
		self.pointer_router.set_roots(self.roots);
		return self;
	}

	static count = function() {
		return array_length(self.roots);
	}

	static at = function(_index) {
		return self.roots[_index];
	}

	static insert = function(_root, _index = array_length(self.roots), _enabled = true) {
		if (_root == undefined) return self;

		_root.ui_layer_enabled = _enabled;
		_index = clamp(_index, 0, array_length(self.roots));
		array_insert(self.roots, _index, _root);
		self._sync_router();
		return self;
	}

	static set_enabled = function(_root_id, _enabled) {
		var _index = self._index_of(_root_id);
		if (_index != -1) {
			self.roots[_index].ui_layer_enabled = _enabled;
			self._sync_router();
		}
		return self;
	}

	static remove = function(_root_id) {
		var _index = self._index_of(_root_id);
		if (_index != -1) {
			array_delete(self.roots, _index, 1);
			self._sync_router();
		}
		return self;
	}

	static clear = function() {
		self.roots = [];
		self.pointer_router.clear_roots();
		return self;
	}

	static update = function() {
		self.pointer_router.update();
		for (var _i = 0; _i < array_length(self.roots); _i++) {
			var _root = self.roots[_i];
			if (_root != undefined && _root.ui_layer_enabled) {
				_root.update();
			}
		}
	}

	static draw = function() {
		for (var _i = 0; _i < array_length(self.roots); _i++) {
			var _root = self.roots[_i];
			if (_root != undefined && _root.ui_layer_enabled) {
				_root.draw();
			}
		}
	}

	static destroy = function() {
		self.clear();
		self.pointer_router.destroy();
	}
}

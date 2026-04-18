new UIManager();

function UIManager() constructor {
	static roots = [];

	static destroy = function() {
		self.roots = [];
	}

	static index_of = function(_root) {
		return array_get_index(self.roots, _root);
	}

	static count = function() {
		return array_length(self.roots);
	}

	static at = function(_index) {
		return self.roots[_index];
	}

	static insert = function(_root, _index = array_length(self.roots), _enabled = true) {
		_root.enabled = _enabled;
		array_insert(self.roots, _index, _root);
		return self;
	}

	static remove = function(_root) {
		var _index = self.index_of(_root);
		if (_index != -1) {
			array_delete(self.roots, _index, 1);
		}
		return self;
	}

	static set_enabled = function(_root, _enabled) {
		var _index = self.index_of(_root);
		if (_index != -1) {
			self.roots[_index].enabled = _enabled;
		}
		return self;
	}

	static update = function() {
		var _block = false;
		for (var _i = array_length(self.roots) - 1; _i >= 0; _i--) {
			var _root = self.roots[_i];
			if (_root.enabled) _block = _root.update(_block);
		}
	}

	static draw = function() {
		for (var _i = 0; _i < array_length(self.roots); _i++) {
			var _root = self.roots[_i];
			if (_root.enabled) _root.draw();
		}
	}
}

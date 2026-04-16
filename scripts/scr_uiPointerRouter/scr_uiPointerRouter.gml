function UIPointerRouter() constructor {
	self.roots = [];
	self.hovered = [];
	self.pressed = undefined;
	self.focused = undefined;
	self.pointer_x = 0;
	self.pointer_y = 0;
	self.pointer_down = false;
	self.pointer_pressed = false;
	self.pointer_released = false;

	static _set_focus = function(_element) {
		if (self.focused == _element) return;

		if (self.focused != undefined) {
			self.focused.pointer.focus_lost = true;
			self.focused.pointer.focused = false;
		}

		self.focused = _element;

		if (self.focused != undefined) {
			self.focused.pointer.focus_gained = true;
			self.focused.pointer.focused = true;
		}
	}

	static _set_hovered = function(_next) {
		for (var _i = 0; _i < array_length(self.hovered); _i++) {
			var _element = self.hovered[_i];
			if (array_get_index(_next, _element) == -1) {
				_element.pointer.left = true;
			}
		}

		for (var _i = 0; _i < array_length(_next); _i++) {
			var _element = _next[_i];
			if (array_get_index(self.hovered, _element) == -1) {
				_element.pointer.entered = true;
			}
			_element.pointer.hovered = true;
			_element.pointer.target = _next[0];
		}

		self.hovered = _next;
	}

	static _refresh_roots = function() {
		for (var _i = 0; _i < array_length(self.roots); _i++) {
			var _root = self.roots[_i];
			_root.clear_pointer(self.pointer_x, self.pointer_y);
			if (_root.ui_layer_enabled) _root.refresh_layout();
		}
	}

	static _collect_hovered = function(_x, _y) {
		for (var _root_i = array_length(self.roots) - 1; _root_i >= 0; _root_i--) {
			var _root = self.roots[_root_i];
			if (_root == undefined || !_root.ui_layer_enabled) continue;

			var _hits = _root.collect_pointer_targets(_x, _y, []);
			if (array_length(_hits) == 0) continue;

			var _hovered = [];
			for (var _hit_i = array_length(_hits) - 1; _hit_i >= 0; _hit_i--) {
				var _hit = _hits[_hit_i];
				array_push(_hovered, _hit);
				if (_hit.pointer_capture) break;
			}
			return _hovered;
		}

		return [];
	}

	static _get_capture_target = function(_hovered) {
		for (var _i = 0; _i < array_length(_hovered); _i++) {
			if (_hovered[_i].pointer_capture) return _hovered[_i];
		}
		return undefined;
	}

	static set_roots = function(_roots) {
		self.clear_roots();
		for (var _i = 0; _i < array_length(_roots); _i++) {
			array_push(self.roots, _roots[_i]);
		}
		return self;
	}

	static clear_roots = function() {
		self.roots = [];
		self._set_hovered([]);
		self.pressed = undefined;
		self._set_focus(undefined);
		return self;
	}

	static destroy = function() {
		self.clear_roots();
	}

	static update = function() {
		self.pointer_x = device_mouse_x_to_gui(0);
		self.pointer_y = device_mouse_y_to_gui(0);
		self.pointer_down = mouse_check_button(mb_left);
		self.pointer_pressed = mouse_check_button_pressed(mb_left);
		self.pointer_released = mouse_check_button_released(mb_left);

		self._refresh_roots();
		if (self.focused != undefined) {
			self.focused.pointer.focused = true;
		}
		if (self.pressed != undefined && self.pointer_down) {
			self.pressed.pointer.down = true;
			self.pressed.pointer.pressed_target = self.pressed;
		}
		self._set_hovered(self._collect_hovered(self.pointer_x, self.pointer_y));

		if (self.pointer_pressed) {
			self.pressed = self._get_capture_target(self.hovered);

			if (self.pressed != undefined) {
				self.pressed.pointer.pressed = true;
				self.pressed.pointer.down = true;
				self.pressed.pointer.pressed_target = self.pressed;
			}

			if (self.pressed != undefined && self.pressed.focusable) {
				self._set_focus(self.pressed);
			} else {
				self._set_focus(undefined);
			}
		}

		if (self.pointer_released) {
			var _pressed = self.pressed;
			self.pressed = undefined;

			if (_pressed != undefined) {
				_pressed.pointer.released = true;
				_pressed.pointer.pressed_target = _pressed;
				if (array_get_index(self.hovered, _pressed) != -1) {
					_pressed.pointer.clicked = true;
				}
			}
		}

		return self;
	}
}

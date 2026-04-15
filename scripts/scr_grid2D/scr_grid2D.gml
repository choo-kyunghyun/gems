function Grid2D(_width, _height) constructor {
	self.rows = _height;
	self.cols = _width;

	static cell_count = function() {
		return self.rows * self.cols;
	}

	static create_array = function(_value = 0) {
		return array_create(self.cell_count(), _value);
	}

	static in_bounds = function(_x, _y) {
		return _x >= 0 && _x < self.cols && _y >= 0 && _y < self.rows;
	}

	static to_index = function(_x, _y) {
		return _y * self.cols + _x;
	}

	static to_xy = function(_index) {
		return { x: _index mod self.cols, y: _index div self.cols };
	}
}

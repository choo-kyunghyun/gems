function Terrain(_width, _height) : Grid2D(_width, _height) constructor {
    self.data = self.create_array();

    static import = function(_data) {
        var _cols = _data[$ "cols"];
        var _rows = _data[$ "rows"];
        if (_cols == undefined || _rows == undefined) return new Terrain(0, 0);

        var _terrain = new Terrain(_cols, _rows);
        var _data_array = _data[$ "data"];
        if (is_array(_data_array)) _terrain.data = variable_clone(_data_array);
        return _terrain;
    }

    static export = function() {
        return {
            rows: self.rows,
            cols: self.cols,
            data: variable_clone(self.data),
        };
    }

    static set_cell = function(_x, _y, _value) {
        if (!self.in_bounds(_x, _y)) return false;
        self.data[self.to_index(_x, _y)] = _value;
        return true;
    }
    
    static get_cell = function(_x, _y) {
        if (!self.in_bounds(_x, _y)) return undefined;
        return self.data[self.to_index(_x, _y)];
    }
}

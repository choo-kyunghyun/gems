enum MP_ALGORITHM {
    ASTAR,
}

function MotionPlanner(_grid) constructor {
    static COST_INF = infinity;
    static SQRT_2 = sqrt(2);
    static DIRS_CARDINAL = [
        1, 0, 1,
        -1, 0, 1,
        0, 1, 1,
        0, -1, 1,
    ];
    static DIRS_OCTILE = [
        1, 0, 1,
        -1, 0, 1,
        0, 1, 1,
        0, -1, 1,
        1, 1, self.SQRT_2,
        1, -1, self.SQRT_2,
        -1, 1, self.SQRT_2,
        -1, -1, self.SQRT_2,
    ];
    self.grid = _grid;

    static set_grid = function(_grid) {
        self.grid = _grid;
    }

    static plan = function(_start, _goal, _algo = MP_ALGORITHM.ASTAR, _opt = {}) {
        switch (_algo) {
            case MP_ALGORITHM.ASTAR: return self.plan_astar(_start, _goal, _opt);
            default: return [];
        }
    }

    static reconstruct_path = function(_came_from, _start_i, _goal_i) {
        var _indices = [];
        var _node = _goal_i;
        while (_node != -1) {
            array_push(_indices, _node);
            if (_node == _start_i) break;
            _node = _came_from[_node];
        }
        if (array_length(_indices) == 0 || _indices[array_length(_indices) - 1] != _start_i) {
            return [];
        }

        var _path = [];
        for (var _i = array_length(_indices) - 1; _i >= 0; _i--) {
            var _p = self.grid.to_xy(_indices[_i]);
            array_push(_path, _p);
        }
        return _path;
    }

    static astar_heuristic = function(_x0, _y0, _x1, _y1, _allow_diag) {
        var _dx = abs(_x1 - _x0);
        var _dy = abs(_y1 - _y0);
        if (_allow_diag) {
            return (_dx + _dy) + (self.SQRT_2 - 2) * min(_dx, _dy);
        }
        return _dx + _dy;
    }

    static plan_astar = function(_start, _goal, _opt) {
        var _allow_diag = _opt[$ "allow_diagonal"] ?? false;
        var _corner_cutting = _opt[$ "corner_cutting"] ?? false;
        var _heuristic_weight = _opt[$ "heuristic_weight"] ?? 1;
        var _max_iter = _opt[$ "max_iter"] ?? 100000;

        var _sx = _start[$ "x"];
        var _sy = _start[$ "y"];
        var _gx = _goal[$ "x"];
        var _gy = _goal[$ "y"];

        if (!self.grid.in_bounds(_sx, _sy) || !self.grid.in_bounds(_gx, _gy)) return [];
        if (self.grid.is_blocked(_sx, _sy) || self.grid.is_blocked(_gx, _gy)) return [];

        var _start_i = self.grid.to_index(_sx, _sy);
        var _goal_i = self.grid.to_index(_gx, _gy);
        if (_start_i == _goal_i) return [ { x: _sx, y: _sy } ];

        var _count = self.grid.rows * self.grid.cols;
        var _g = array_create(_count, self.COST_INF);
        var _came_from = array_create(_count, -1);
        var _closed = array_create(_count, false);

        var _pq = ds_priority_create();
        _g[_start_i] = 0;
        var _h0 = self.astar_heuristic(_sx, _sy, _gx, _gy, _allow_diag);
        ds_priority_add(_pq, _start_i, _h0 * _heuristic_weight);

        var _dirs = _allow_diag ? self.DIRS_OCTILE : self.DIRS_CARDINAL;
        var _iter = 0;

        while (!ds_priority_empty(_pq)) {
            if (++_iter > _max_iter) break;

            var _node = ds_priority_delete_min(_pq);
            if (_closed[_node]) continue;
            _closed[_node] = true;

            if (_node == _goal_i) {
                var _path = self.reconstruct_path(_came_from, _start_i, _goal_i);
                ds_priority_destroy(_pq);
                return _path;
            }

            var _xy = self.grid.to_xy(_node);
            var _node_x = _xy.x;
            var _node_y = _xy.y;

            for (var _i = 0; _i < array_length(_dirs); _i += 3) {
                var _dx = _dirs[_i];
                var _dy = _dirs[_i + 1];
                var _step_dist = _dirs[_i + 2];

                var _nx = _node_x + _dx;
                var _ny = _node_y + _dy;
                if (!self.grid.in_bounds(_nx, _ny)) continue;
                if (self.grid.is_blocked(_nx, _ny)) continue;

                if (_allow_diag && !_corner_cutting && _dx != 0 && _dy != 0) {
                    if (self.grid.is_blocked(_node_x + _dx, _node_y) || self.grid.is_blocked(_node_x, _node_y + _dy)) {
                        continue;
                    }
                }

                var _ni = self.grid.to_index(_nx, _ny);
                if (_closed[_ni]) continue;

                var _cell_cost = self.grid.get_cost(_nx, _ny);
                var _tentative_g = _g[_node] + _cell_cost * _step_dist;
                if (_tentative_g >= _g[_ni]) continue;

                _came_from[_ni] = _node;
                _g[_ni] = _tentative_g;
                var _h = self.astar_heuristic(_nx, _ny, _gx, _gy, _allow_diag);
                var _f = _tentative_g + _h * _heuristic_weight;
                ds_priority_add(_pq, _ni, _f);
            }
        }
        
        ds_priority_destroy(_pq);
        return [];
    }
}

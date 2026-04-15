function MotionPlanningGrid(_width, _height) : Grid2D(_width, _height) constructor {
    self.cost = self.create_array(1);
    self.blocked = self.create_array(true);
    
    static get_cost = function(_x, _y) {
        return self.cost[self.to_index(_x, _y)];
    }

    static set_cost = function(_x, _y, _cost) {
        self.cost[self.to_index(_x, _y)] = _cost;
    }

    static is_blocked = function(_x, _y) {
        return self.blocked[self.to_index(_x, _y)];
    }

    static set_blocked = function(_x, _y, _blocked) {
        self.blocked[self.to_index(_x, _y)] = _blocked;
    }

    static set_cell = function(_x, _y, _cost, _blocked) {
        var _index = self.to_index(_x, _y);
        self.cost[_index] = _cost;
        self.blocked[_index] = _blocked;
    }
}

function StateMachine() constructor {
    self.state = undefined;
    self.next_state = undefined;
    self.force_change = false;
    self.owner = undefined;
    self.states = {};

    static add_state = function(_name, _state) {
        self.states[$ _name] = _state;
        return _state;
    }

    static get_state = function(_name) {
        return self.states[$ _name];
    }

    static remove_state = function(_name) {
        struct_remove(self.states, _name);
    }

    static clear_states = function() {
        self.states = {};
    }

    static change_state = function(_name, _force = false) {
        self.next_state = self.get_state(_name);
        self.force_change = _force;
    }

    static spawn = function() {
        if (self.state == undefined) return false;
        var _next = self.state[$ "state_spawn"];
        if (_next == undefined) return false;
        self.change_state(_next, true);
        return true;
    }

    static despawn = function() {
        if (self.state == undefined) return false;
        var _next = self.state[$ "state_despawn"];
        if (_next == undefined) return false;
        self.change_state(_next, true);
        return true;
    }
    
    static update = function() {
        if (self.next_state) {
            if (self.state != self.next_state || self.force_change) {
                if (self.state) self.state.finish(self.owner);
                self.state = self.next_state;
                if (self.state) self.state.enter(self.owner);
            }
            self.next_state = undefined;
        }
        
        if (self.state) self.state.update(self.owner);
    }
    
    static draw = function() {
        if (self.state) self.state.draw(self.owner);
    }
}

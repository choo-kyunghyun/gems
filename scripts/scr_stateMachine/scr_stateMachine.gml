function StateMachine() constructor {
    self.state = undefined;
    self.next_state = undefined;
    self.force_change = false;
    self.owner = undefined;
    
    static change = function(_next, _force = false) {
        self.next_state = _next;
        self.force_change = _force;
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

function StateMachine() constructor {
    self.state = undefined;
    self.nextState = undefined;
    self.forceChange = false;
    self.owner = undefined;
    
    static change = function(_next, _force = false) {
        self.nextState = _next;
        self.forceChange = _force;
    }
    
    static update = function() {
        if (self.nextState) {
            if (self.state != self.nextState || self.forceChange) {
                if (self.state) self.state.finish(self.owner);
                self.state = self.nextState;
                if (self.state) self.state.enter(self.owner);
            }
            self.nextState = undefined;
        }
        
        if (self.state) self.state.update(self.owner);
    }
    
    static draw = function() {
        if (self.state) self.state.draw(self.owner);
    }
}

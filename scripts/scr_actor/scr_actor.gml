function Actor() : Entity() constructor {
    self.name = "";
    self.state_machine = new StateMachine();
    
    static on_spawn = function() {
        self.state_machine.owner = self.instance;
    }
    
    static on_despawn = function() {
        self.state_machine.owner = undefined;
    }
    
    static update = function() {
        self.state_machine.update();
    }
    
    static draw = function() {
        self.state_machine.draw();
    }
}

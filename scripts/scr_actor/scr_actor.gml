function Actor() : Entity() constructor {
    self.name = "";
    self.stateMachine = new StateMachine();
    
    static on_spawn = function() {
        self.stateMachine.owner = self.instance;
    }
    
    static on_despawn = function() {
        self.stateMachine.owner = undefined;
    }
    
    static update = function() {
        self.stateMachine.update();
    }
    
    static draw = function() {
        self.stateMachine.draw();
    }
}

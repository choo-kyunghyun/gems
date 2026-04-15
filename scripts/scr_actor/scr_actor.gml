function Actor(_data = {}) : Entity(_data) constructor {
    self.name = _data[$ "name"] ?? "";
    self.hit = _data[$ "hit"] ?? 0;
    self.dirty = _data[$ "dirty"] ?? true;

    self.state_machine = new StateMachine();
    self.state_machine.owner = self;
    self.type = ENTITY_TYPE.ACTOR;
    self.world = undefined;
    
    static import = function(_data) {
        return new Actor(_data);
    }

    static on_export = function(_out) {
        _out[$ "name"] = self.name;
        _out[$ "hit"] = self.hit;
        _out[$ "dirty"] = self.dirty;
    }
    
    static on_spawn = function() {
        if (self.instance != noone) {
            variable_instance_set(self.instance, "actor_ref", self);
        }
        self.state_machine.spawn();
    }
    
    static on_despawn = function() {
        self.state_machine.despawn();
    }
    
    static update = function() {
        self.state_machine.update();
    }
    
    static draw = function() {
        self.state_machine.draw();
    }
}

function Entity() constructor {
    self.id = "";
    self.type = "";
    self.instance = noone;
    self.x = 0;
    self.y = 0;
    self.z = 0;
    self.dirty = true;
    self.object = -1;
    self.properties = {};
    self.hit = 0;
    
    static on_spawn = function() {}
    static on_despawn = function() {}
    
    static spawn = function() {
        if (self.object == -1) return noone;
        if (self.instance != noone) return self.instance;
        
        self.instance = instance_create_depth(self.x, self.y, self.z, self.object, self.properties);
        self.on_spawn();
        return self.instance;
    }
    
    static despawn = function() {
        if (self.instance != noone) {
            self.x = self.instance.x;
            self.y = self.instance.y;
            self.z = self.instance.depth;
            
            self.on_despawn();
            instance_destroy(self.instance);
            self.instance = noone;
        }
    }
}

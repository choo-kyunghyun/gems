enum ENTITY_TYPE {
    ENTITY,
    ACTOR,
}

function Entity(_data = {}) constructor {
    var _id = _data[$ "id"];
    if (_id == undefined || string(_id) == "") _id = uuid();
    self.id = string(_id);
    self.type = _data[$ "type"] ?? ENTITY_TYPE.ENTITY;
    self.instance = noone;
    self.x = _data[$ "x"] ?? 0;
    self.y = _data[$ "y"] ?? 0;
    self.z = _data[$ "z"] ?? 0;
    self.object = _data[$ "object"] ?? obj_entity;
    self.properties = _data[$ "properties"] == undefined ? {} : variable_clone(_data[$ "properties"]);

    static update = function() {}
    static draw = function() {}
    static on_export = function(_out) {}
    static on_spawn = function() {}
    static on_despawn = function() {}

    static import = function(_data) {
        return new Entity(_data);
    }

    static export = function() {
        var _out = {
            id: self.id,
            type: self.type,
            x: self.x,
            y: self.y,
            z: self.z,
            object: self.object,
            properties: variable_clone(self.properties),
        };

        self.on_export(_out);
        return _out;
    }

    static is_instantiated = function() {
        return self.instance != noone;
    }

    static set_position = function(_x, _y, _z = undefined) {
        if (_z == undefined) _z = self.z;
        self.x = _x;
        self.y = _y;
        self.z = _z;

        if (self.instance != noone) {
            self.instance.x = _x;
            self.instance.y = _y;
            self.instance.depth = _z;
        }
    }
    
    static spawn = function() {
        if (self.object == -1) return noone;
        if (self.instance != noone) return self.instance;
        
        self.instance = instance_create_depth(self.x, self.y, self.z, self.object, self.properties);
        self.instance.x = self.x;
        self.instance.y = self.y;
        self.instance.depth = self.z;
        variable_instance_set(self.instance, "entity_id", self.id);
        variable_instance_set(self.instance, "entity_ref", self);
        self.on_spawn();
        return self.instance;
    }
    
    static despawn = function() {
        if (self.instance != noone) {
            self.on_despawn();
            instance_destroy(self.instance);
            self.instance = noone;
        }
    }
}

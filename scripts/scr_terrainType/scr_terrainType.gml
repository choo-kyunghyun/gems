function TerrainType(_def = {}) constructor {
    self.id = _def[$ "id"] ?? "";
    self.name = _def[$ "name"] ?? "";
    self.path_cost = _def[$ "path_cost"] ?? 1;
    self.blocked = _def[$ "blocked"] ?? false;
    self.properties = variable_clone(_def[$ "properties"] ?? {});

    static import = function(_data) {
        return new TerrainType(_data);
    }

    static export = function() {
        return {
            id: self.id,
            name: self.name,
            path_cost: self.path_cost,
            blocked: self.blocked,
            properties: variable_clone(self.properties),
        };
    }
}

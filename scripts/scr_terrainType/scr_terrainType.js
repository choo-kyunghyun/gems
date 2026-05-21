global.TerrainType = class TerrainType {
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.path_cost = def.path_cost ?? 1;
    this.blocked = def.blocked ?? false;
    this.properties = variable_clone(def.properties ?? {});
  }

  static import(data) {
    return new TerrainType(data);
  }

  export() {
    return {
      id: this.id,
      name: this.name,
      path_cost: this.path_cost,
      blocked: this.blocked,
      properties: variable_clone(this.properties),
    };
  }
};

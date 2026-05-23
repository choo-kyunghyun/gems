globalThis.TerrainType = class TerrainType {
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.pathCost = def.pathCost ?? 1;
  }

  static import(data) {
    return new TerrainType(data);
  }

  export() {
    return {
      id: this.id,
      name: this.name,
      pathCost: this.pathCost,
    };
  }
};

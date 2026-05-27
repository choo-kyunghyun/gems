globalThis.FloorType = class FloorType {
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.pathCost = def.pathCost ?? 1;
  }

  static import(data) {
    return new FloorType(data);
  }

  export() {
    return {
      id: this.id,
      name: this.name,
      pathCost: this.pathCost,
    };
  }
};

globalThis.StructureType = class StructureType {
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.pathCost = def.pathCost ?? Infinity;
  }

  export() {
    return { id: this.id, name: this.name, pathCost: this.pathCost };
  }

  static import(data) {
    return new StructureType(data);
  }
};

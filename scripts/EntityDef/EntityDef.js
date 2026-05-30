globalThis.EntityDef = class EntityDef {
  static defs = new Map();

  static register(defs) {
    for (const def of defs) {
      this.defs.set(def.id, def);
    }
  }

  static spawn(defId, x, y, z = 0) {
    const def = this.defs.get(defId);
    if (def === undefined) throw new Error(`Unknown entity def: ${defId}`);

    const id = Entity.create();
    Position.set(id, x, y, z);

    for (const [compName, compDef] of Object.entries(def.components ?? {})) {
      const comp = Entity.get(compName);
      if (comp !== undefined && typeof comp.fromDef === "function") {
        comp.fromDef(id, compDef);
      }
    }

    return id;
  }

  static has(defId) {
    return this.defs.has(defId);
  }

  static get(defId) {
    return this.defs.get(defId);
  }
};

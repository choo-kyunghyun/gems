globalThis.Entity = class Entity {
  static MAX_ENTITIES = MAX_ENTITIES;
  static components = new Map();
  static destroyQueue = new Set();

  static reset() {
    for (const component of this.components.values()) {
      component.data.fill(undefined);
    }
    this.destroyQueue.clear();
    IdPool.destroy();
  }

  static destroy() {
    this.reset();
    this.components.clear();
  }

  static export() {
    const snapshot = {
      idPool: IdPool.export(),
      components: {},
    };

    for (const [name, component] of this.components.entries()) {
      snapshot.components[name] = component.export();
    }

    return JSON.stringify(snapshot);
  }

  static import(json) {
    const snapshot = JSON.parse(json);

    IdPool.import(snapshot.idPool);
    this.destroyQueue.clear();

    for (const [name, component] of this.components.entries()) {
      const data = snapshot.components[name] || [];
      component.import(data);
    }
  }

  static register(component) {
    this.components.set(component.name, component);
    return component;
  }

  static unregister(component) {
    this.components.delete(component.name);
  }

  static get(name) {
    return this.components.get(name);
  }

  static create() {
    return IdPool.alloc();
  }

  static remove(id) {
    this.destroyQueue.add(id);
  }

  static flush() {
    if (this.destroyQueue.size === 0) return;

    for (const id of this.destroyQueue) {
      if (!IdPool.isValid(id)) continue;
      const index = IdPool.getIndex(id);

      for (const component of this.components.values()) {
        component.delete(index);
      }

      IdPool.free(id);
    }

    this.destroyQueue.clear();
  }

  static isValid(id) {
    return IdPool.isValid(id);
  }
};

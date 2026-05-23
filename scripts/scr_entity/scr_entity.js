globalThis.Entity = class Entity {
  constructor(maximum = 10000) {
    this.components = new Map();
    this.destroyQueue = new Set();
    this.idPool = new IdPool(maximum);
  }

  destroy() {
    this.components.clear();
    this.destroyQueue.clear();
    this.idPool.destroy();
  }

  export() {
    const snapshot = {
      idPool: this.idPool.export(),
      components: {},
    };

    for (const [name, component] of this.components.entries()) {
      snapshot.components[name] = component.export();
    }

    return JSON.stringify(snapshot);
  }

  import(json) {
    const snapshot = JSON.parse(json);

    this.idPool.import(snapshot.idPool);
    this.destroyQueue.clear();

    for (const [name, component] of this.components.entries()) {
      const data = snapshot.components[name] || [];
      component.import(data);
    }
  }

  register(component) {
    this.components.set(component.name, component);
    return component;
  }

  unregister(component) {
    this.components.delete(component.name);
  }

  create() {
    return this.idPool.alloc();
  }

  remove(id) {
    this.destroyQueue.add(id);
  }

  flush() {
    if (this.destroyQueue.size === 0) return;

    for (const id of this.destroyQueue) {
      if (!this.idPool.isValid(id)) continue;
      const index = this.idPool.getIndex(id);

      for (const component of this.components.values()) {
        component.delete(index);
      }

      this.idPool.free(id);
    }

    this.destroyQueue.clear();
  }

  isValid(id) {
    return this.idPool.isValid(id);
  }
};

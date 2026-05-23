globalThis.Component = class Component {
  constructor() {
    this.data = new Map();
    this.name = this.constructor.name;
  }

  has(id) {
    return this.data.has(IdPool.getIndex(id));
  }

  delete(id) {
    this.data.delete(IdPool.getIndex(id));
  }

  get(id) {
    return this.data.get(IdPool.getIndex(id));
  }

  export() {
    return Array.from(this.data.entries());
  }

  import(data) {
    this.data = new Map(data);
  }
};

globalThis.Name = class Name extends Component {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, name) {
    this.data[IdPool.getIndex(id)] = name;
  }
};

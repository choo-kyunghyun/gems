globalThis.Position = class Position extends Component {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, x, y, z) {
    this.data[IdPool.getIndex(id)] = { x, y, z };
  }
};

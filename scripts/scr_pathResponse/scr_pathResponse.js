globalThis.PathResponse = class PathResponse extends Component {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, path) {
    this.data[IdPool.getIndex(id)] = path;
  }
};

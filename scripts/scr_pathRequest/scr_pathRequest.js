globalThis.PathRequest = class PathRequest extends Component {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, x, y) {
    this.data[IdPool.getIndex(id)] = { x, y };
  }
};

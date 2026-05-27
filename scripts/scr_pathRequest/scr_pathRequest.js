globalThis.PathRequest = class PathRequest extends Component {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, sx, sy, gx, gy) {
    this.data[IdPool.getIndex(id)] = { sx, sy, gx, gy };
  }
};

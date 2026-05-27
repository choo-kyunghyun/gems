globalThis.PathCursor = class PathCursor extends Component {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static current(id) {
    const index = IdPool.getIndex(id);
    const cursor = this.data[index];
    if (cursor === undefined) return undefined;
    const path = PathResponse.data[index];
    if (path === undefined) return undefined;
    return path[cursor];
  }

  static advance(id) {
    const index = IdPool.getIndex(id);
    const cursor = this.data[index];
    if (cursor === undefined) return false;
    const path = PathResponse.data[index];
    if (path === undefined) return false;
    const next = cursor + 1;
    if (next >= path.length) {
      this.data[index] = undefined;
      PathResponse.data[index] = undefined;
      return false;
    }
    this.data[index] = next;
    return true;
  }
};

globalThis.Hit = class Hit extends Component {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, hit) {
    this.data[IdPool.getIndex(id)] = hit;
  }
};

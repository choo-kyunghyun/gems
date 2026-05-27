globalThis.Visual = class Visual extends Component {
  static data = new Array(MAX_ENTITIES).fill(undefined);

  static set(id, sprite, subimg) {
    this.data[IdPool.getIndex(id)] = { sprite, subimg };
  }
};

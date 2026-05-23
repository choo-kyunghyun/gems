globalThis.Visual = class Visual extends Component {
  constructor() {
    // super();
    this.data = new Map();
    this.name = "Visual";
  }

  set(id, sprite) {
    this.data.set(IdPool.getIndex(id), { sprite });
  }
};

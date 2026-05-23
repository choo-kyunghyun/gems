globalThis.Hit = class Hit extends Component {
  constructor() {
    // super();
    this.data = new Map();
    this.name = "Hit";
  }

  set(id, hit) {
    this.data.set(IdPool.getIndex(id), hit);
  }
};

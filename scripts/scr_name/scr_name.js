globalThis.Name = class Name extends Component {
  constructor() {
    // super();
    this.data = new Map();
    this.name = "Name";
  }

  set(id, name) {
    this.data.set(IdPool.getIndex(id), name);
  }
};

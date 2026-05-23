globalThis.Position = class Position extends Component {
  constructor() {
    // super();
    this.data = new Map();
    this.name = "Position";
  }

  set(id, x, y, z) {
    this.data.set(IdPool.getIndex(id), { x, y, z });
  }
};

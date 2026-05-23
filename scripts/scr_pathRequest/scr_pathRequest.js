globalThis.PathRequest = class PathRequest extends Component {
  constructor() {
    // super();
    this.data = new Map();
    this.name = "PathRequest";
  }

  set(id, x, y) {
    this.data.set(IdPool.getIndex(id), { x, y });
  }
};

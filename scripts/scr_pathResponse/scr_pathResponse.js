globalThis.PathResponse = class PathResponse extends Component {
  constructor() {
    // super();
    this.data = new Map();
    this.name = "PathResponse";
  }

  set(id, path) {
    this.data.set(IdPool.getIndex(id), path);
  }
};

global.Terrain = class Terrain extends Grid2D {
  constructor(width, height) {
    super(width, height);
    this.data = this.create_array();
  }

  static import(data) {
    const rows = data.rows;
    const cols = data.cols;
    if (rows === undefined || cols === undefined) return new Terrain(0, 0);

    const terrain = new Terrain(cols, rows);
    const data_array = data.data;
    if (Array.isArray(data_array)) terrain.data = variable_clone(data_array);
    return terrain;
  }

  export() {
    return {
      rows: this.rows,
      cols: this.cols,
      data: variable_clone(this.data),
    };
  }

  set_cell(x, y, value) {
    if (!this.in_bounds(x, y)) return false;
    this.data[this.to_index(x, y)] = value;
    return true;
  }

  get_cell(x, y) {
    if (!this.in_bounds(x, y)) return undefined;
    return this.data[this.to_index(x, y)];
  }
};

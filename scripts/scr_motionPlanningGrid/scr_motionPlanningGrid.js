global.MotionPlanningGrid = class MotionPlanningGrid extends Grid2D {
  constructor(width, height) {
    super(width, height);
    this.cost = this.create_array(1);
    this.blocked = this.create_array(true);
  }

  get_cost(x, y) {
    return this.cost[this.to_index(x, y)];
  }

  set_cost(x, y, cost) {
    this.cost[this.to_index(x, y)] = cost;
  }

  is_blocked(x, y) {
    return this.blocked[this.to_index(x, y)];
  }

  set_blocked(x, y, blocked) {
    this.blocked[this.to_index(x, y)] = blocked;
  }

  set_cell(x, y, cost, blocked) {
    const index = to_index(x, y);
    this.cost[index] = cost;
    this.blocked[index] = blocked;
  }
};

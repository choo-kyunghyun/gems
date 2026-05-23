globalThis.MotionPlanningGrid = class MotionPlanningGrid {
  constructor(width, height) {
    this.rows = height;
    this.cols = width;

    this.cost = new Grid(width, height).clear(1);
    this.blocked = new Grid(width, height).clear(true);
  }

  getCost(x, y) {
    return this.cost.get(x, y);
  }

  setCost(x, y, cost) {
    this.cost.set(x, y, cost);
  }

  isBlocked(x, y) {
    return this.blocked.get(x, y);
  }

  setBlocked(x, y, blocked) {
    this.blocked.set(x, y, blocked);
  }

  setCell(x, y, cost, blocked) {
    this.cost.set(x, y, cost);
    this.blocked.set(x, y, blocked);
  }
};

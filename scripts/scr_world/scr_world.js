globalThis.World = class World {
  constructor(world = {}) {
    this.cellWidth = world.cellWidth ?? 32;
    this.cellHeight = world.cellHeight ?? 32;
    this.width = world.width ?? Math.floor(room_width / this.cellWidth);
    this.height = world.height ?? Math.floor(room_height / this.cellHeight);
    this.layers = new Map();
  }

  export() {}

  import(data) {}

  destroy() {}

  update() {}
};

/// @deprecated
globalThis.World_D = class World {
  constructor(world) {
    this.tick = 0;
    this.nav_dirty = true;

    this.terrain = new Terrain(this.width, this.height);
    this.mpg = new MotionPlanningGrid(this.width, this.height);
    this.mp = new MotionPlanning(this.mpg);
  }

  rebuild_subsystems() {
    this.terrain = new Terrain(this.width, this.height);
    this.mpg = new MotionPlanningGrid(this.width, this.height);
    this.mp = new MotionPlanning(this.mpg);
  }

  destroy() {
    this.mp = undefined;
    this.mpg = undefined;
    this.terrain = undefined;
  }

  load_level(level = {}) {
    this.cell_width = level.cell_width ?? this.cell_width;
    this.cell_height = level.cell_height ?? this.cell_height;
    this.width = level.width ?? this.width;
    this.height = level.height ?? this.height;

    this.rebuild_subsystems();
    this.import(level);
    this.tick = 0;
    return this;
  }

  import(data) {
    const terrain = data.terrain;
    if (typeof terrain === "object") this.terrain = Terrain.import(terrain);

    this.nav_dirty = true;
    this.mp.reset(this.mpg);
    return this;
  }

  export() {
    return {
      terrain: this.terrain.export(),
    };
  }

  mark_nav_dirty() {
    this.nav_dirty = true;
  }

  update() {
    this.tick++;

    if (this.nav_dirty) {
      // TODO: Terrain/Structure -> MPGrid dirty patch sync
      this.nav_dirty = false;
      this.mp.increaseVersion();
    }
  }
};

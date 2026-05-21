// TODO: ECS
// what a crappy code it is

global.World = class World {
  constructor(world) {
    this.cell_width = world.cell_width ?? 32;
    this.cell_height = world.cell_height ?? 32;
    this.width = world.width ?? Math.floor(room_width / this.cell_width);
    this.height = world.height ?? Math.floor(room_height / this.cell_height);

    this.tick = 0;
    this.nav_dirty = true;

    this.terrain = new Terrain(this.width, this.height);
    this.mpg = new MotionPlanningGrid(this.width, this.height);
    this.mp = new MotionPlanning(this.mpg);
    this.actor_manager = new ActorManager(this);
  }

  rebuild_subsystems() {
    this.terrain = new Terrain(this.width, this.heigth);
    this.mpg = new MotionPlanningGrid(this.width, this.height);
    this.mp = new MotionPlanning(this.mpg);
    this.actor_manager.clear();
  }

  destroy() {
    this.actor_manager.destroy();
    this.mp = undefined;
    this.mpg = undefined;
    this.terrain = undefined;
    this.actor_manager = undefined;
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
    if (typeof terrain === "object")
      this.terrain = this.terrain.import(terrain);

    const actors = data.actors ?? [];
    this.actor_manager.import(actors);

    this.nav_dirty = true;
    this.mp.reset(this.mpg);
    return this;
  }

  export() {
    return {
      terrain: this.terrain.export(),
      actors: this.actor_manager.export(),
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
      this.mp.increase_version();
    }

    this.actor_manager.update();
    if (this.actor_manager.pending_removals.length > 0)
      this.actor_manager.flush();
  }

  draw() {
    this.actor_manager.draw();
  }
};

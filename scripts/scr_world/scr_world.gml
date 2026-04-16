function World(_world = {}) constructor {
    self.cell_width = _world[$ "cell_width"] ?? 32;
    self.cell_height = _world[$ "cell_height"] ?? 32;
    self.width = _world[$ "width"] ?? max(1, room_width div self.cell_width);
    self.height = _world[$ "height"] ?? max(1, room_height div self.cell_height);

    self.tick = 0;
    self.nav_dirty = true;
    
    self.terrain = new Terrain(self.width, self.height);
    self.mpg = new MotionPlanningGrid(self.width, self.height);
    self.mp = new MotionPlanning(self.mpg);
    self.actor_manager = new ActorManager(self);

    static _reset_runtime = function() {
        self.tick = 0;
        self.nav_dirty = true;
        self.mp.reset(self.mpg);
    }

    static _rebuild_subsystems = function() {
        self.terrain = new Terrain(self.width, self.height);
        self.mpg = new MotionPlanningGrid(self.width, self.height);
        self.mp = new MotionPlanning(self.mpg);
        self.actor_manager.clear();
    }

    static destroy = function() {
        self.actor_manager.destroy();
        self.mp = undefined;
        self.mpg = undefined;
        self.terrain = undefined;
        self.actor_manager = undefined;
    }

    static load_level = function(_level = {}) {
        self.cell_width = _level[$ "cell_width"] ?? self.cell_width;
        self.cell_height = _level[$ "cell_height"] ?? self.cell_height;
        self.width = _level[$ "width"] ?? self.width;
        self.height = _level[$ "height"] ?? self.height;

        self._rebuild_subsystems();

        var _terrain = _level[$ "terrain"];
        if (is_struct(_terrain)) self.terrain = self.terrain.import(_terrain);

        var _actors = _level[$ "actors"] ?? [];
        self.actor_manager.import(_actors);

        self._reset_runtime();
        return self;
    }

    static import = function(_data) {
        var _terrain = _data[$ "terrain"];
        if (is_struct(_terrain)) self.terrain = self.terrain.import(_terrain);

        var _actors_state = _data[$ "actors"] ?? [];
        self.actor_manager.import(_actors_state);

        self.nav_dirty = true;
        self.mp.reset(self.mpg);
        return self;
    }

    static export = function() {
        return {
            terrain: self.terrain.export(),
            actors: self.actor_manager.export(),
        };
    }

    static mark_nav_dirty = function() {
        self.nav_dirty = true;
    }
    
    static update = function() {
        self.tick++;

        if (self.nav_dirty) {
            // TODO: Terrain/Structure -> MPGrid dirty patch sync
            self.nav_dirty = false;
            self.mp.increase_version();
        }

        self.actor_manager.update();

        if (array_length(self.actor_manager.pending_removals) > 0) self.actor_manager.flush_pending_removals();
    }

    static draw = function() {
        self.actor_manager.draw();
    }
}

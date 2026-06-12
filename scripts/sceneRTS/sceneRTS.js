// Minimal RTS demo: a block of units seeks the clicked point while
// SeparationSystem keeps them from overlapping. Shows the modular pipeline
// SolidSystem (move) -> SeparationSystem (push-apart, multiple iterations).

const RTS_UNIT_COUNT = 40;
const RTS_UNIT_SPEED = 120;
const RTS_SEPARATION_ITERS = 4;

SceneRegistry.add(() => new _SceneRTSClass(), {
  label: I18n.textRef("RTS_NAME"),
  category: "SCENE_CAT_STRATEGY",
});

class _SceneRTSClass extends Scene {
  label = "RTS";

  create(openScene) {
    this.world = new World(256, 60);
    SeparationSystem.iterations = RTS_SEPARATION_ITERS;

    const w = surface_get_width(application_surface);
    const h = surface_get_height(application_surface);
    const cx = w * 0.5;
    const cy = h * 0.5;
    this.target = { x: cx, y: cy };

    // Static camera anchored at field center (followLerp 1 = no easing).
    this.anchor = this.world.create();
    this.world.add(this.anchor, Position, { x: cx, y: cy, z: 0 });

    // A clustered grid of units, so separation has work to do on the first move.
    this.units = [];
    const cols = 8;
    const gap = 18;
    for (let i = 0; i < RTS_UNIT_COUNT; i++) {
      const gx = (i % cols) - cols / 2;
      const gy = Math.floor(i / cols) - 2;
      const id = this.world.create();
      this.world.add(id, Position, {
        x: cx + gx * gap,
        y: cy + gy * gap,
        z: 0,
      });
      this.world.add(id, Velocity, { x: 0, y: 0, z: 0 });
      this.world.add(id, BBox, { x: -8, y: -8, width: 16, height: 16 });
      this.world.add(id, Collision, {
        solid: true,
        kinematic: false,
        mask: null,
        hits: [],
      });
      this.units.push(id);
    }

    this.physics = new Pipeline().add(SolidSystem).add(SeparationSystem);

    this.renderer = new Renderer();
    this.renderer.insert(new RenderDebugEntity());

    this.camera = cameraFollow2d({
      world: this.world,
      followTarget: this.anchor,
      followLerp: 1,
      width: w,
      height: h,
    });
    this.camera.assign(0);

    // Pause menu owns the exit (Esc / Start); no in-world Back button.
    PauseMenu.arm(openScene);

    this.ui = gemsRoot();
    UI.insert(this.ui);
    this.ui.insertChild(
      gemsLabel(I18n.textRef("RTS_HINT"), { color: "#888888" }),
    );
  }

  step() {
    if (PauseMenu.update()) return; // paused — freeze the sim

    if (mouse_check_button(mb_left)) {
      this.target.x = mouse_x;
      this.target.y = mouse_y;
    }

    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // record pre-move positions for render lerp
      this._seek();
      this.physics.update(this.world);
      this.world.flush();
    }
    this.camera.update();
  }

  _seek() {
    for (let i = 0; i < this.units.length; i++) {
      const pos = this.world.get(Position, this.units[i]);
      const vel = this.world.get(Velocity, this.units[i]);
      const dx = this.target.x - pos.x;
      const dy = this.target.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 4) {
        vel.x = (dx / dist) * RTS_UNIT_SPEED;
        vel.y = (dy / dist) * RTS_UNIT_SPEED;
      } else {
        vel.x = 0;
        vel.y = 0;
      }
    }
  }

  draw() {
    this.renderer.draw(this.world);
  }

  destroy() {
    SeparationSystem.iterations = 1;
    teardownScene(this);
  }
}

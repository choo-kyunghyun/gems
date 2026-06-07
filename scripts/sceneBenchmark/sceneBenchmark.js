// ECS stress benchmark — the measurement harness for World.query()/forEach and the
// O(n^2) physics systems. Spawns N solid dynamic bodies that wander inside four
// kinematic walls, running the full SolidSystem -> SeparationSystem -> TriggerSystem
// pipeline each tick. The HUD shows entity count and real FPS; use +/- to push N
// until the frame rate drops, and compare fps_real across builds.

const BENCH_DEFAULT_COUNT = 200;
const BENCH_SPEED = 120;

SceneRegistry.add(() => new _SceneBenchmarkClass(), {
  label: I18n.textRef("BENCH_NAME"),
  category: "SCENE_CAT_BENCHMARK",
});

class _SceneBenchmarkClass extends Scene {
  label = "Benchmark";

  create(openScene) {
    this.count = BENCH_DEFAULT_COUNT;
    this.field = {
      w: surface_get_width(application_surface),
      h: surface_get_height(application_surface),
    };
    this._build();

    this.ui = new UIElement({
      width: "100%",
      height: "100%",
      padding: 16,
      gap: 12,
    });
    UI.insert(this.ui);
    this.ui.insertChild(
      makeButton(I18n.textRef("BENCH_BACK"), () => openScene(SCENES.lobby)),
    );
    this.ui.insertChild(
      makeButton("+100", () => this._resize(this.count + 100)),
    );
    this.ui.insertChild(
      makeButton("-100", () => this._resize(Math.max(50, this.count - 100))),
    );
  }

  // Rebuild the world at a new body count (the world is sized to count, so it must
  // be torn down and recreated rather than resized in place).
  _resize(n) {
    this.count = n;
    this.camera.destroy();
    this.renderer.destroy();
    this.world.destroy();
    this._build();
  }

  _build() {
    const w = this.field.w;
    const h = this.field.h;
    this.world = new World(this.count + 16, 60); // +16 headroom for walls + anchor
    this.world.broadphase = new Broadphase(w, h, 64); // cellSize 64 >> entity diameter 12

    this._wall(w * 0.5, -8, w, 16);
    this._wall(w * 0.5, h + 8, w, 16);
    this._wall(-8, h * 0.5, 16, h);
    this._wall(w + 8, h * 0.5, 16, h);

    this.movers = [];
    for (let i = 0; i < this.count; i++) {
      const id = this.world.create();
      this.world.add(id, Position, {
        x: random_range(40, w - 40),
        y: random_range(40, h - 40),
        z: 0,
      });
      this.world.add(id, Velocity, { x: 0, y: 0, z: 0 });
      this.world.add(id, BBox, { x: -6, y: -6, width: 12, height: 12 });
      this.world.add(id, Collision, {
        solid: true,
        kinematic: false,
        mask: null,
        hits: [],
      });
      this.movers.push(id);
    }

    this.physics = new Pipeline()
      .add(SolidSystem)
      .add(SeparationSystem)
      .add(TriggerSystem);

    this.renderer = new Renderer();
    this.renderer.insert(new RenderDebugEntity());

    this.anchor = this.world.create();
    this.world.add(this.anchor, Position, { x: w * 0.5, y: h * 0.5, z: 0 });
    this.camera = cameraFollow2d({
      world: this.world,
      followTarget: this.anchor,
      followLerp: 1,
      width: w,
      height: h,
    });
    this.camera.assign(0);
  }

  _wall(x, y, w, h) {
    const id = this.world.create();
    this.world.add(id, Position, { x, y, z: 0 });
    this.world.add(id, BBox, { x: -w * 0.5, y: -h * 0.5, width: w, height: h });
    this.world.add(id, Collision, {
      solid: true,
      kinematic: true,
      mask: null,
      hits: [],
    });
  }

  step() {
    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world);
      this._wander();
      this.physics.update(this.world);
      this.world.flush();
    }
    this.camera.update();
  }

  // Re-seed every body's velocity to a random direction each tick. Keeps constant
  // motion (SolidSystem zeroes velocity on contact) so the collision load stays
  // steady and the bodies stay clustered enough to exercise SeparationSystem.
  _wander() {
    for (let i = 0; i < this.movers.length; i++) {
      const vel = this.world.get(Velocity, this.movers[i]);
      const a = random_range(0, 2 * Math.PI);
      vel.x = Math.cos(a) * BENCH_SPEED;
      vel.y = Math.sin(a) * BENCH_SPEED;
    }
  }

  draw() {
    this.renderer.draw(this.world);

    const color = draw_get_color();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    draw_set_color(c_white);
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);
    draw_text(
      16,
      80,
      I18n.text("BENCH_COUNT", this.count) +
        "\nfps: " +
        fps +
        "\nfps_real: " +
        string_format(fps_real, 0, 1),
    );
    draw_set_color(color);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }

  destroy() {
    teardownScene(this);
  }
}

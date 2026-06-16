const PLATF_GRAVITY = 1200;
const PLATF_MAX_FALL = 900;
const PLATF_DEATH_Y = 900; // fall past this (off a platform edge into the void) → reset to spawn
const PLATF_STOMP_BOUNCE = 420; // upward vy given to the player after stomping an enemy

SceneRegistry.add(() => new _ScenePlatformerClass(), {
  label: I18n.textRef("PLAT_NAME"),
  category: "SCENE_CAT_ACTION",
});

// Side-scrolling movement showcase: weighty platformer movement (accel/skid, coyote
// time, jump buffering, variable jump height, one-way drop-through) over a hand-built
// level. Enemies patrol and are defeated by stomping; touching one from the side, a
// spike, or the void resets the player to spawn. No RPG layer (no HP/inventory/combat).
class _ScenePlatformerClass extends Scene {
  label = "Platformer";

  create() {
    this.world = new World(256, 60, { gravity: PLATF_GRAVITY });
    this.spawn = PlatformerLevel.build(this.world); // hard-coded level (no shared levels/ file)
    this.ctrl = PlatformerController.create(this.world, this.spawn);

    this.physics = new Pipeline()
      .add(GravitySystem)
      .add((world) => {
        const vel = world.get(Velocity, this.ctrl.id);
        if (vel.y > PLATF_MAX_FALL) vel.y = PLATF_MAX_FALL;
      })
      .add(SolidSystem)
      .add(TriggerSystem); // fills col.hits so spikes can be detected

    this.renderer = new Renderer();
    this.renderer.insert(new RenderDebugBox()); // filled colored boxes
    this.renderer.insert(new RenderDebugName()); // entity Name labels on top
    this.renderer.insert(new RenderDebugDirection()); // facing dot (player Direction)
    const bbox = new RenderDebugEntity(); // lime bbox outlines, off until toggled (Debug menu)
    bbox.enabled = false;
    this.renderer.insert(bbox);

    this.camera = cameraFollow2d({
      world: this.world,
      followTarget: this.ctrl.id,
      followLerp: 0.15,
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
    });
    this.camera.assign(0);

    // Gameplay scene: the SystemMenu overlay owns pause + exit (Esc / Start / F1) and
    // suspends menu nav while playing. Flag it here (a subclass field initializer
    // wouldn't run on GMRT).
    this.gameplay = true;

    // Control hint (flexpanel, GUI layer).
    this.ui = gemsRoot();
    UI.insert(this.ui);
    this.ui.insertChild(
      gemsLabel(I18n.textRef("PLAT_HINT"), { color: "#888888" }),
    );

    Log.info(
      `Platformer showcase ready — enemies=${this.world.query(Enemy).length}`,
    );
  }

  step() {
    // No pause gate here — obj_game skips scene.step() entirely while the SystemMenu is
    // open (global pause), so reaching this line means we're live.

    PlatformerController.pollInput(this.ctrl); // jump edges, once per frame
    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // record pre-move positions for render lerp
      PlatformerController.update(this.world, this.ctrl); // movement/jump → velocity
      this.physics.update(this.world);
      EnemySystem.update(this.world); // patrol/turn (after SolidSystem)

      // Stomp a head from above → defeat + bounce; any other enemy contact, a spike,
      // or falling into the void → reset to spawn.
      const id = this.ctrl.id;
      if (EnemySystem.resolveStomp(this.world, id)) {
        this.world.get(Velocity, id).y = -PLATF_STOMP_BOUNCE;
      } else {
        let hurt = EnemySystem.resolveTouch(
          this.world,
          id,
          this.ctrl.iframes > 0,
        );
        if (
          !hurt &&
          this.ctrl.iframes <= 0 &&
          CollectibleSystem.hitSpike(this.world, id)
        )
          hurt = true;
        if (hurt)
          PlatformerController.respawn(this.world, this.ctrl, this.spawn);
      }
      if (this.world.get(Position, id).y > PLATF_DEATH_Y)
        PlatformerController.respawn(this.world, this.ctrl, this.spawn);

      this.world.flush();
    }

    this.camera.update();
  }

  draw() {
    this.renderer.draw(this.world); // player / enemies: colored boxes + labels + bbox
  }

  destroy() {
    PlatformerController.destroy();
    teardownScene(this);
  }
}

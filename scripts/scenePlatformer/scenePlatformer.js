const PLATF_GRAVITY = 1200;
const PLATF_IFRAMES_STOMP = 30; // invincibility ticks after a successful stomp (0.5 s at 60 Hz)
const PLATF_MAX_FALL = 900;
const PLATF_DEATH_Y = 900; // fall past this (off a platform edge into the void) → respawn
const PLATF_LEVEL_COUNT = 2; // number of platformer_N.json files in datafiles/levels/

SceneRegistry.add(() => new _ScenePlatformerClass(), {
  label: I18n.textRef("PLAT_NAME"),
  category: "SCENE_CAT_ACTION",
});

class _ScenePlatformerClass extends Scene {
  label = "Platformer";

  create(openScene) {
    this.score = 0;
    this.totalCoins = 0;
    this.won = false;

    // UI is built once and persists across level transitions.
    this.ui = gemsRoot();
    UI.insert(this.ui);
    this.ui.insertChild(
      gemsButton(I18n.textRef("PLAT_BACK"), () => openScene(SCENES.lobby)),
    );
    this.ui.insertChild(
      gemsLabel(I18n.textRef("PLAT_LEVEL", () => this.levelIndex + 1), { color: "#ffffff" }),
    );
    this.ui.insertChild(
      gemsLabel(
        I18n.textRef("PLAT_COINS", () => this.score, () => this.totalCoins),
        { color: "#ffd700" },
      ),
    );
    this.ui.insertChild(
      gemsLabel(
        () => (this.checkpointActive ? I18n.text("PLAT_CHECKPOINT") : ""),
        { color: "#00bfff" },
      ),
    );
    this.ui.insertChild(
      gemsLabel(() => (this.won ? I18n.text("PLAT_WIN") : ""), { color: "#7cfc00" }),
    );

    this._initLevel(0);
  }

  // Build world, level entities, player, physics pipeline, renderer, and camera
  // for the given level index. Accumulates totalCoins so the coin HUD shows
  // cumulative progress across all levels. Called from create() on first load
  // and from loadLevel() after old resources are torn down.
  _initLevel(index) {
    this.levelIndex = index;
    this.world = new World(256, 60, { gravity: PLATF_GRAVITY });
    const levelData = LevelSerializer.load(
      `levels/platformer_${index + 1}.json`,
      { genre: "platformer" },
    );
    this.spawn = PlatformerLevel.build(this.world, levelData);
    this.ctrl = PlatformerController.create(this.world, this.spawn);

    let coins = 0;
    for (let i = 0; i < levelData.spawns.length; i++) {
      const p = levelData.spawns[i].preset;
      if (p === "coin" || p === "q_block") coins++;
    }
    this.totalCoins += coins;
    this.checkpointActive = false;

    this.physics = new Pipeline()
      .add(GravitySystem)
      .add((world) => {
        const vel = world.get(Velocity, this.ctrl.id);
        if (vel.y > PLATF_MAX_FALL) vel.y = PLATF_MAX_FALL;
      })
      .add(SolidSystem)
      .add(TriggerSystem) // fills col.hits so coins/goal/powerups can be collected
      .add(ProjectileSystem) // moves fireballs, raycasts hits, applies damage
      .add(LifetimeSystem); // expires fireballs that travel too far

    this.renderer = new Renderer();
    this.renderer.insert(new RenderDebugEntity());

    this.camera = cameraFollow2d({
      world: this.world,
      followTarget: this.ctrl.id,
      followLerp: 0.15,
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
    });
    this.camera.assign(0);
  }

  // Tear down the current level's resources and initialise the next.
  loadLevel(index) {
    PlatformerController.destroy();
    this.camera.destroy();
    this.renderer.destroy();
    this.world.destroy();
    this._initLevel(index);
  }

  step() {
    if (this.won) return; // all levels cleared — freeze the simulation

    PlatformerController.pollInput(this.ctrl); // sample jump edges once per frame
    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // record pre-move positions for render lerp
      PlatformerController.update(this.world, this.ctrl);
      const prevVelY = this.world.get(Velocity, this.ctrl.id).y; // before physics
      this.physics.update(this.world);
      EnemySystem.update(this.world); // patrol/turn (after SolidSystem)

      const sr = EnemySystem.resolveStomp(
        this.world,
        this.ctrl.id,
        this.ctrl.iframes > 0,
      );
      if (sr.stomped) this.ctrl.iframes = PLATF_IFRAMES_STOMP;
      PlatformerController.tryFireball(this.world, this.ctrl);
      let dead = sr.hurt;
      if (!dead && this.world.get(Position, this.ctrl.id).y > PLATF_DEATH_Y)
        dead = true;
      if (
        !dead &&
        this.ctrl.iframes <= 0 &&
        CollectibleSystem.hitSpike(this.world, this.ctrl.id)
      )
        dead = true;
      if (dead) {
        if (!PlatformerController.shrink(this.world, this.ctrl))
          PlatformerController.respawn(this.world, this.ctrl, this.spawn);
      } else {
        this.score += CollectibleSystem.collect(this.world, this.ctrl.id);
        this.score += BlockSystem.resolveHit(
          this.world,
          this.ctrl.id,
          prevVelY,
        );
        const pu = CollectibleSystem.collectPowerup(this.world, this.ctrl.id);
        if (pu !== null)
          PlatformerController.grantPowerup(this.world, this.ctrl, pu);
        const cp = CollectibleSystem.reachedCheckpoint(
          this.world,
          this.ctrl.id,
        );
        if (cp !== undefined) {
          this.spawn = cp;
          this.checkpointActive = true;
        }
        if (CollectibleSystem.reachedGoal(this.world, this.ctrl.id)) {
          const next = this.levelIndex + 1;
          if (next < PLATF_LEVEL_COUNT) {
            // More levels — transition immediately. loadLevel destroys the old
            // world, so skip world.flush() for this tick and break out.
            this.loadLevel(next);
            break;
          } else {
            this.won = true;
          }
        }
      }

      this.world.flush();
      if (this.won) break;
    }
    this.camera.update();
  }

  draw() {
    this.renderer.draw(this.world);
  }

  destroy() {
    PlatformerController.destroy();
    teardownScene(this);
  }
}

const PLATF_GRAVITY = 1200;
const PLATF_MAX_FALL = 900;
const PLATF_DEATH_Y = 900; // fall past this (off a platform edge into the void) → reset to spawn
const PLATF_STOMP_BOUNCE = 420; // upward vy given to the player after stomping an enemy

// global factory so it can be pushed as a SceneManager guest (RPG arcade cabinet).
// not SceneRegistry.add'd — reachable only in-world, not from the lobby.
globalThis.ScenePlatformer = () => new _ScenePlatformerClass();

// side-scrolling movement showcase: accel/skid, coyote time, jump buffer, variable jump,
// one-way drop-through, stomp enemies, spike/void respawn. no RPG layer.
// standalone SCREEN class — no base (GMRT subclassing is broken); duck-typed contract, see Level.
class _ScenePlatformerClass {
  create() {
    // set here, not as a class field: I18n may not have this locale's text at class-def time.
    this.label = I18n.text("PLAT_NAME");

    this.world = new Entity(256, { gravity: PLATF_GRAVITY });
    this.spawn = PlatformerLevel.build(this.world);
    this.ctrl = PlatformerController.create(this.world, this.spawn);
    // set on `this` in create(), not as a class field: subclass field initializers don't run on GMRT.
    this.stomps = 0; // score reported back to host via result()
    Music.play(mus_ambient_danger); // crossfades the RPG's overworld track; restored on pop

    this.physics = new Pipeline()
      .add(GravitySystem)
      .add((world) => {
        const vel = world.get(Velocity, this.ctrl.id);
        if (vel.y > PLATF_MAX_FALL) vel.y = PLATF_MAX_FALL;
      })
      .add(SolidSystem)
      .add(TriggerSystem); // fills col.hits for spike detection

    this.renderer = new Renderer();
    // entities still carry the broken SVG sprites (spr_play/spr_choo), so they render as the
    // spr_missing placeholder (RenderEntity's fallback) until the platformer gets real art
    this.renderer.insert(new RenderEntity());
    const bbox = new RenderDebugEntity(); // off by default; toggled via Debug menu
    bbox.enabled = false;
    this.renderer.insert(bbox);

    this.camera = CameraFollow.create2d({
      world: this.world,
      followTarget: this.ctrl.id,
      followLerp: 0.15,
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
    });
    this.camera.assign(0);

    // opts SystemMenu into gameplay pause + nav suspension.
    // set here, not as a class field: subclass field initializers don't run on GMRT.
    this.gameplay = true;

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
    PlatformerController.pollInput(this.ctrl); // edge-triggered input latched once per frame
    const ticks = World.sim.advance();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world);
      PlatformerController.update(this.world, this.ctrl);
      this.physics.update(this.world);
      EnemySystem.update(this.world); // patrol/turn — runs after SolidSystem

      const id = this.ctrl.id;
      if (EnemySystem.resolveStomp(this.world, id)) {
        this.world.get(Velocity, id).y = -PLATF_STOMP_BOUNCE;
        this.stomps++;
        Audio.play(snd_hitsound_flesh); // non-positional — platformer sets no audio listener
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
    this.renderer.draw(this.world);
  }

  // score returned to the RPG arcade cabinet via SceneManager.pop
  result() {
    return { stomps: this.stomps };
  }

  destroy() {
    PlatformerController.destroy();
    teardownScene(this);
  }
}

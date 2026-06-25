const PLATF_GRAVITY = 1200;
const PLATF_MAX_FALL = 900;
const PLATF_DEATH_Y = 900; // fall past this (off a platform edge into the void) → reset to spawn
const PLATF_STOMP_BOUNCE = 420; // upward vy given to the player after stomping an enemy

// Exposed as a global factory (like SceneRpg) so it can be pushed as a minigame onto the
// SceneManager stack (the RPG arcade cabinet). It is NOT SceneRegistry.add'd: the platformer
// is reachable only in-world via the arcade cabinet, no longer as a standalone lobby scene.
// (With no registry entry, SceneManager._make resolves no label, so create() sets this.label
// directly for the SystemMenu readout — see below.)
globalThis.ScenePlatformer = () => new _ScenePlatformerClass();

// Side-scrolling movement showcase: weighty platformer movement (accel/skid, coyote
// time, jump buffering, variable jump height, one-way drop-through) over a hand-built
// level. Enemies patrol and are defeated by stomping; touching one from the side, a
// spike, or the void resets the player to spawn. No RPG layer (no HP/inventory/combat).
class _ScenePlatformerClass extends Scene {
  create() {
    // Display label for the SystemMenu readout. Set here, not as a class field: subclass
    // field initializers don't run on GMRT, and there's no SceneRegistry entry to source it from.
    this.label = I18n.text("PLAT_NAME");

    this.world = new World(256, 60, { gravity: PLATF_GRAVITY });
    this.spawn = PlatformerLevel.build(this.world); // hard-coded level (no shared levels/ file)
    this.ctrl = PlatformerController.create(this.world, this.spawn);
    this.stomps = 0; // enemies stomped this run — the score reported back when run as a minigame
    // (set on `this` in create(), not a class field: subclass field initializers don't run on GMRT)
    Audio.bgm("mus_battle"); // driving theme; as an arcade guest it crossfades the RPG's (restored on pop)

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
        this.stomps++; // score for the minigame reward (harmless when run standalone)
        Audio.play("snd_hit"); // stomp defeat (non-positional — the platformer sets no audio listener)
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

  // Result handed back to the host when this runs as a minigame (SceneManager.pop reads it):
  // the run's score → the RPG arcade's coin reward. Unused when opened standalone from the lobby.
  result() {
    return { stomps: this.stomps };
  }

  destroy() {
    PlatformerController.destroy();
    teardownScene(this);
  }
}

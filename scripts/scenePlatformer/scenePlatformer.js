const PLATF_MOVE_SPEED = 200;
const PLATF_JUMP_POWER = 700;
const PLATF_GRAVITY    = 1200;
const PLATF_MAX_FALL   = 900;

SceneRegistry.add(
  () => new _ScenePlatformerClass(),
  { label: I18n.textRef("PLAT_NAME"), category: "SCENE_CAT_ACTION" },
);

class _ScenePlatformerClass extends Scene {
  label = "Platformer";
  _jumpBuffer = 0;

  create(openScene) {
    this._jumpBuffer = 0;

    Input.register("moveLeft",  new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("A")));
    Input.register("moveRight", new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("D")));
    Input.register("jump",      new InputAction().bindButton(INPUT_SOURCE.KEYBOARD, ord("W")));

    this.world = new World(256, 60, { gravity: PLATF_GRAVITY });

    // Player
    this.player = this.world.create();
    this.world.add(this.player, Position,  { x: 80,  y: 300, z: 0 });
    this.world.add(this.player, Velocity,  { x: 0,   y: 0,   z: 0 });
    this.world.add(this.player, BBox,      { x: -12, y: -24, width: 24, height: 24 });
    this.world.add(this.player, Collision, { solid: true, kinematic: false, mask: null, hits: [] });
    this.world.add(this.player, Grounded,  { isGrounded: false });
    this.world.add(this.player, Name,      { name: "Player" });

    // Floor & Platforms
    const platforms = [
      { x: 0,   y: 440, w: 900, h: 32 },
      { x: 60,  y: 350, w: 160, h: 20 },
      { x: 310, y: 270, w: 160, h: 20 },
      { x: 560, y: 190, w: 160, h: 20 },
      { x: 700, y: 330, w: 160, h: 20 },
    ];
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      const id = this.world.create();
      this.world.add(id, Position,  { x: p.x, y: p.y, z: 0 });
      this.world.add(id, BBox,      { x: 0, y: 0, width: p.w, height: p.h });
      this.world.add(id, Collision, { solid: true, kinematic: true, mask: null, hits: [] });
      this.world.add(id, Name,      { name: "Platform" });
    }

    this.renderer = new Renderer();
    this.renderer.insert(new RenderDebugEntity());

    this.camera = cameraFollow2d({
      world: this.world,
      followTarget: this.player,
      followLerp: 0.15,
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
    });
    this.camera.assign(0);

    this.ui = new UIElement({ width: "100%", height: "100%", padding: 16 });
    UI.insert(this.ui);
    this.ui.insertChild(makeButton(I18n.textRef("PLAT_BACK"), () => openScene(SCENES.lobby)));
  }

  step() {
    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      this._handleInput();
      GravitySystem.update(this.world);
      const vel = this.world.get(Velocity, this.player);
      if (vel.y > PLATF_MAX_FALL) vel.y = PLATF_MAX_FALL;
      MovementSystem.update(this.world);
      CollisionSystem.update(this.world);
      GroundedSystem.update(this.world);
      this.world.flush();
    }
    this.camera.update();
  }

  draw() {
    this.renderer.draw(this.world);
  }

  destroy() {
    Input.unregister("moveLeft");
    Input.unregister("moveRight");
    Input.unregister("jump");
    this.camera.destroy();
    this.renderer.destroy();
    this.world.destroy();
    UI.remove(this.ui);
    this.ui.destroy();
  }

  _handleInput() {
    if (Input.get("jump").pressed()) this._jumpBuffer = 10;

    const vel = this.world.get(Velocity, this.player);
    const dx = (Input.get("moveRight").down() ? 1 : 0) - (Input.get("moveLeft").down() ? 1 : 0);
    vel.x = dx * PLATF_MOVE_SPEED;

    if (this._jumpBuffer > 0 && this.world.get(Grounded, this.player).isGrounded) {
      vel.y = -PLATF_JUMP_POWER;
      this._jumpBuffer = 0;
    } else if (this._jumpBuffer > 0) {
      this._jumpBuffer--;
    }
  }

}

// Release mode
const RELEASE_MODE = false;
gml_release_mode(RELEASE_MODE);
audio_throw_on_error(!RELEASE_MODE);
// exception_unhandled_handler();

// Game
randomize();
this.persistent = true;

// GPU
gpu_set_ztestenable(true);
gpu_set_alphatestenable(true);

// Window
let w = display_get_width() / 2;
let h = display_get_height() / 2;
window_set_size(w, h);
surface_resize(application_surface, w, h);
window_center();

// Framerate
game_set_speed(display_get_frequency(), gamespeed_fps);

// Draw
draw_set_circle_precision(64);
// draw_enable_svg_aa(true);
// draw_set_svg_aa_level(1);

// UI
I18n.load("i18n/ko-KR/manifest.json");
// draw_set_font(I18n.font("normal_36"));
display_set_gui_maximise();

// Input
globalThis.GAME_INPUT = Object.freeze({
  UP: "up",
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right",
});

Input.register(
  GAME_INPUT.UP,
  new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("W")),
);
Input.register(
  GAME_INPUT.DOWN,
  new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("S")),
);
Input.register(
  GAME_INPUT.LEFT,
  new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("A")),
);
Input.register(
  GAME_INPUT.RIGHT,
  new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("D")),
);

// Entity
Entity.register(Animation);
Entity.register(Collision);
Entity.register(Direction);
Entity.register(Gravity);
Entity.register(Hit);
Entity.register(Lifetime);
Entity.register(Tag);
Entity.register(Name);
Entity.register(PathCursor);
Entity.register(PathRequest);
Entity.register(PathResponse);
Entity.register(Position);
Entity.register(State);
Entity.register(Visual);

// Settings
Settings.load();

// Simulation
globalThis.SIMULATION = new Simulation(60);
globalThis.SIMULATION_SYSTEMS = [
  Animation,
  Lifetime,
  State,
  GravitySystem,
  MovementSystem,
  CollisionSystem,
  PathfindingSystem,
  { update() { Entity.flush(); } },
];

// Done
room_goto_next();

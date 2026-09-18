/**
 * The colony's keymap — input LIFECYCLE, not simulation: the app registers it once at boot (Game
 * Create_0) and it stays for the run; the settings key-binding list (`rows`) rebinds it live, and
 * InputPreset persists the rebinds over it. What the actions DRIVE each frame is PlayerSystem's.
 */
globalThis.ColonyKeymap = {
  /**
   * register the colony keymap + InputContext tags (boot; idempotent).
   *
   * tags (set by sceneColony each frame): movement live everywhere; fire "play"-only so it self-mutes
   * while building/window (no per-frame BuildMode check); the build brush "build"-only, on the same
   * mouse buttons (the context splits them — and Input mutes both while the build bar holds the
   * pointer); interact opens in play / closes a window; build inert with a window open. See
   * InputContext / inContext.
   */
  bind() {
    const ANYWHERE = ["play", "build", "window"];
    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A"), ANYWHERE],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D"), ANYWHERE],
      moveUp: [INPUT_SOURCE.KEYBOARD, ord("W"), ANYWHERE],
      moveDown: [INPUT_SOURCE.KEYBOARD, ord("S"), ANYWHERE],
      sprint: [INPUT_SOURCE.KEYBOARD, vk_shift, ANYWHERE], // hold to sprint (drains Stamina)
      fire: [INPUT_SOURCE.MOUSE, mb_left, ["play"]],
      buildPlace: [INPUT_SOURCE.MOUSE, mb_left, ["build"]], // place the brush (BuildMode)
      buildRemove: [INPUT_SOURCE.MOUSE, mb_right, ["build"]], // deconstruct under the brush (BuildMode)
      inventory: [INPUT_SOURCE.KEYBOARD, ord("I"), ANYWHERE],
      interact: [INPUT_SOURCE.KEYBOARD, ord("E"), ["play", "window"]],
      build: [INPUT_SOURCE.KEYBOARD, ord("B"), ["play", "build"]],
      reload: [INPUT_SOURCE.KEYBOARD, ord("R"), ["play"]], // top up the equipped gun's magazine
      grenade: [INPUT_SOURCE.KEYBOARD, ord("G"), ["play"]], // lob a grenade at the cursor
    });

    // gamepad (device 0) added alongside the keyboard bindings (InputAction OR-combines). Twin-stick:
    // left=move, right=aim. Self-mutes while a menu owns nav, so the sticks drive UINav with a window open.
    const GP = INPUT_SOURCE.GAMEPAD;
    Input.get("moveLeft").bindButton(GP, gp_padl);
    Input.get("moveRight").bindButton(GP, gp_padr);
    Input.get("moveUp").bindButton(GP, gp_padu);
    Input.get("moveDown").bindButton(GP, gp_padd);
    Input.get("sprint").bindButton(GP, gp_shoulderl); // LB (hold)
    Input.get("fire").bindButton(GP, gp_shoulderrb); // RT
    Input.get("inventory").bindButton(GP, gp_face4); // Y
    Input.get("interact").bindButton(GP, gp_face1); // A
    Input.get("build").bindButton(GP, gp_face3); // X
    Input.get("grenade").bindButton(GP, gp_shoulderlb); // LT
    // analog axes: left stick = movement (everywhere), right stick = aim ("play" only)
    Input.register(
      "moveX",
      new InputAction()
        .bindAxis(INPUT_AXIS_MODE.STICK, gp_axislh)
        .inContext(ANYWHERE),
    );
    Input.register(
      "moveY",
      new InputAction()
        .bindAxis(INPUT_AXIS_MODE.STICK, gp_axislv)
        .inContext(ANYWHERE),
    );
    Input.register(
      "aimX",
      new InputAction()
        .bindAxis(INPUT_AXIS_MODE.STICK, gp_axisrh)
        .inContext(["play"]),
    );
    Input.register(
      "aimY",
      new InputAction()
        .bindAxis(INPUT_AXIS_MODE.STICK, gp_axisrv)
        .inContext(["play"]),
    );

    // hotbar number keys 1..N, "play"-only so they self-mute with a window open or building (keyboard
    // only — the gamepad dpad is movement)
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      Input.register(
        "hotbar" + (i + 1),
        new InputAction()
          .bindButton(INPUT_SOURCE.KEYBOARD, ord(String(i + 1)))
          .inContext(["play"]),
      );
    }
  },

  /**
   * The rebindable keymap in display order — `{ action, label }` rows (label a live textRef) for
   * a settings key-binding list (GameOverlay.keymap). The stick axes are gamepad-only and stay out.
   */
  rows() {
    const rows = [
      ["moveUp", "INPUT_MOVE_UP"],
      ["moveLeft", "INPUT_MOVE_LEFT"],
      ["moveDown", "INPUT_MOVE_DOWN"],
      ["moveRight", "INPUT_MOVE_RIGHT"],
      ["sprint", "INPUT_SPRINT"],
      ["fire", "INPUT_FIRE"],
      ["reload", "INPUT_RELOAD"],
      ["grenade", "INPUT_GRENADE"],
      ["interact", "INPUT_INTERACT"],
      ["inventory", "INPUT_INVENTORY"],
      ["build", "INPUT_BUILD"],
    ].map((r) => ({ action: r[0], label: I18n.textRef(r[1]) }));
    for (let i = 0; i < HOTBAR_SIZE; i++)
      rows.push({
        action: "hotbar" + (i + 1),
        label: I18n.textRef("INPUT_HOTBAR", i + 1),
      });
    return rows;
  },
};

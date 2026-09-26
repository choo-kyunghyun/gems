/**
 * The colony's keymap — input lifecycle, not simulation: registered once at boot, it stays for
 * the run and is rebound live from the settings list.
 */
globalThis.ColonyKeymap = {
  /**
   * Idempotent. Context tags split actions sharing a key — fire and the build brush share the
   * mouse buttons — and mute play actions while building, in a window or in a dialogue, so no
   * action needs a per-frame mode check. Interact alone stays live in a dialogue, which it pages.
   */
  bind() {
    const ANYWHERE = ["play", "build", "window"];
    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A"), ANYWHERE],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D"), ANYWHERE],
      moveUp: [INPUT_SOURCE.KEYBOARD, ord("W"), ANYWHERE],
      moveDown: [INPUT_SOURCE.KEYBOARD, ord("S"), ANYWHERE],
      sprint: [INPUT_SOURCE.KEYBOARD, vk_shift, ANYWHERE],
      fire: [INPUT_SOURCE.MOUSE, mb_left, ["play"]],
      buildPlace: [INPUT_SOURCE.MOUSE, mb_left, ["build"]],
      buildRemove: [INPUT_SOURCE.MOUSE, mb_right, ["build"]],
      inventory: [INPUT_SOURCE.KEYBOARD, ord("I"), ANYWHERE],
      interact: [INPUT_SOURCE.KEYBOARD, ord("E"), ["play", "window", "dialogue"]],
      build: [INPUT_SOURCE.KEYBOARD, ord("B"), ["play", "build"]],
      reload: [INPUT_SOURCE.KEYBOARD, ord("R"), ["play"]],
      grenade: [INPUT_SOURCE.KEYBOARD, ord("G"), ["play"]],
    });

    // gamepad bindings OR-combine with the keyboard's; they mute while a menu owns navigation
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

    // keyboard only: the gamepad dpad is movement; live in a window, where a key binds its slot
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      Input.register(
        "hotbar" + (i + 1),
        new InputAction()
          .bindButton(INPUT_SOURCE.KEYBOARD, ord(String(i + 1)))
          .inContext(["play", "window"]),
      );
    }
  },

  /**
   * The rebindable actions in display order, as `{ action, label }` rows with a live textRef
   * label. The gamepad-only stick axes stay out.
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

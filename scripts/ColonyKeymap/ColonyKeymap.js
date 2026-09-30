/**
 * The colony's keymap — input lifecycle, not simulation: registered once at boot, it stays for
 * the run and is rebound live from the settings list.
 */
globalThis.ColonyKeymap = {
  /**
   * Idempotent. Context tags split actions sharing a key — fire and the build brush share the
   * mouse buttons — and mute play actions while building, in a window or in a dialogue, so no
   * action needs a per-frame mode check. Interact alone stays live in a dialogue, which it pages,
   * and its secondary alone in build mode, which it leaves.
   */
  bind() {
    const ANYWHERE = ["play", "build", "window"];
    Input.bindAll({
      moveLeft: [INPUT_SOURCE.KEYBOARD, ord("A"), ANYWHERE],
      moveRight: [INPUT_SOURCE.KEYBOARD, ord("D"), ANYWHERE],
      moveUp: [INPUT_SOURCE.KEYBOARD, ord("W"), ANYWHERE],
      moveDown: [INPUT_SOURCE.KEYBOARD, ord("S"), ANYWHERE],
      dodge: [INPUT_SOURCE.KEYBOARD, vk_shift, ["play", "build"]],
      fire: [INPUT_SOURCE.MOUSE, mb_left, ["play"]],
      buildPlace: [INPUT_SOURCE.MOUSE, mb_left, ["build"]],
      buildRemove: [INPUT_SOURCE.MOUSE, mb_right, ["build"]],
      inventory: [INPUT_SOURCE.KEYBOARD, ord("I"), ANYWHERE],
      interact: [INPUT_SOURCE.KEYBOARD, ord("E"), ["play", "window", "dialogue"]],
      interactAlt: [INPUT_SOURCE.KEYBOARD, ord("F"), ["play", "build"]],
      reload: [INPUT_SOURCE.KEYBOARD, ord("R"), ["play"]],
    });

    // gamepad bindings OR-combine with the keyboard's; they mute while a menu owns navigation
    const GP = INPUT_SOURCE.GAMEPAD;
    Input.get("moveLeft").bindButton(GP, gp_padl);
    Input.get("moveRight").bindButton(GP, gp_padr);
    Input.get("moveUp").bindButton(GP, gp_padu);
    Input.get("moveDown").bindButton(GP, gp_padd);
    Input.get("dodge").bindButton(GP, gp_shoulderl); // LB
    Input.get("fire").bindButton(GP, gp_shoulderrb); // RT
    Input.get("inventory").bindButton(GP, gp_face4); // Y
    Input.get("interact").bindButton(GP, gp_face1); // A
    Input.get("interactAlt").bindButton(GP, gp_face3); // X
    Input.get("reload").bindButton(GP, gp_stickr); // R3
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

    // a key per slot along the number row, live in a window, where a key binds its slot; "-" and
    // "=" have no vk_ constant, so they take their keycodes
    const row = [];
    for (let i = 1; i <= 9; i++) row.push(ord(String(i)));
    row.push(ord("0"), 189, 187);
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      Input.register(
        "hotbar" + (i + 1),
        new InputAction()
          .bindButton(INPUT_SOURCE.KEYBOARD, row[i])
          .inContext(["play", "window"]),
      );
    }
    // the dpad is movement, so the pad reaches the bar through a cursor it steps and uses
    Input.register(
      "hotbarNext",
      new InputAction().bindButton(GP, gp_shoulderr).inContext(["play"]), // RB
    );
    Input.register(
      "hotbarUse",
      new InputAction().bindButton(GP, gp_shoulderlb).inContext(["play"]), // LT
    );
  },

  /**
   * The rebindable actions in display order, as `{ action, label }` rows with a live textRef
   * label. The gamepad-only actions stay out.
   */
  rows() {
    const rows = [
      ["moveUp", "INPUT_MOVE_UP"],
      ["moveLeft", "INPUT_MOVE_LEFT"],
      ["moveDown", "INPUT_MOVE_DOWN"],
      ["moveRight", "INPUT_MOVE_RIGHT"],
      ["dodge", "INPUT_DODGE"],
      ["fire", "INPUT_FIRE"],
      ["reload", "INPUT_RELOAD"],
      ["interact", "INPUT_INTERACT"],
      ["interactAlt", "INPUT_INTERACT_ALT"],
      ["inventory", "INPUT_INVENTORY"],
    ].map((r) => ({ action: r[0], label: I18n.textRef(r[1]) }));
    for (let i = 0; i < HOTBAR_SIZE; i++)
      rows.push({
        action: "hotbar" + (i + 1),
        label: I18n.textRef("INPUT_HOTBAR", i + 1),
      });
    return rows;
  },
};

this.left = "s_left";
this.right = "s_right";
this.up = "s_up";
this.down = "s_down";

Input.register(
  this.left,
  new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("A")),
);
Input.register(
  this.right,
  new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("D")),
);
Input.register(
  this.up,
  new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("W")),
);
Input.register(
  this.down,
  new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("S")),
);

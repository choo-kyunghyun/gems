// Inherit the parent event
event_inherited();

draw_text(64, 192, $"UP: {Input.get(INPUT_ACTIONS.UP).down()}\nDOWN: {Input.get(INPUT_ACTIONS.DOWN).down()}\nLEFT: {Input.get(INPUT_ACTIONS.LEFT).down()}\nRIGHT: {Input.get(INPUT_ACTIONS.RIGHT).down()}");

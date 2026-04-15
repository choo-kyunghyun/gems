// Inherit the parent event
event_inherited();

self.input_status = function() {
    var _str = $"UP [W]: {Input.get(INPUT_ACTIONS.UP).down()}\n";
    _str += $"DOWN [S]: {Input.get(INPUT_ACTIONS.DOWN).down()}\n";
    _str += $"LEFT [A]: {Input.get(INPUT_ACTIONS.LEFT).down()}\n";
    _str += $"RIGHT [D]: {Input.get(INPUT_ACTIONS.RIGHT).down()}"
    return _str;
}

self.main.insert_child(new UIText({}, { text_ref: self.input_status }));

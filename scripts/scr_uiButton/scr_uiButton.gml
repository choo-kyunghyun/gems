function UIButton(_style = {}, _panel = {}, _trigger = undefined, _icon = undefined, _tooltip = undefined, _text = undefined, _desc = undefined) : UIPanel(_style, _panel) constructor {
    self.trigger = undefined;
    self.tooltip = undefined;
    self.icon = undefined;
    self.box = undefined;
    self.text = undefined;
    self.desc = undefined;

    self.set_flex_direction(flexpanel_flex_direction.row);

    if (_trigger != undefined) {
        self.trigger = new UITrigger({ width: "100%", height: "100%", position: "absolute" }, _trigger);
        self.insert_child(self.trigger);
    }

    if (_tooltip != undefined) {
        self.tooltip = new UITooltip({ width: "100%", height: "100%", position: "absolute" }, _tooltip);
        self.insert_child(self.tooltip);
    }

    // TODO: What if the button's height is greater than its width?
    if (_icon != undefined) {
        _icon[$ "fit"] = OBJECT_FIT.CONTAIN;
        self.icon = new UIImage({ height: "100%", aspectRatio: 1 }, _icon);
        self.insert_child(self.icon);
    }

    var _text_exists = (_text != undefined);
    var _desc_exists = (_desc != undefined);
    if (_text_exists || _desc_exists) {
        var _box_style = (self.icon != undefined)
            ? { flexGrow: 1, justifyContent: "center" }
            : { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" };
        self.box = new UIElement(_box_style);
        self.insert_child(self.box);
        if (_text_exists) {
            self.text = new UIText({}, _text);
            self.box.insert_child(self.text);
        }
        if (_desc_exists) {
            self.desc = new UIText({}, _desc);
            self.box.insert_child(self.desc);
        }
    }
}

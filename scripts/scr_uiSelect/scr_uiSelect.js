// global.UISelect = class UISelect extends UITrigger {}
function uiSelect(style = {}, select = {}, panel = {}, text = {}) {
  const trig = uiTrigger(style);
  trig.items = select.items ?? [];
  trig.index = select.index ?? 0;
  trig.on_change = method(this, select.on_change ?? noop);
  trig.on_click = method(this, function () {
    if (this.items.length <= 0) return;
    this.index = (this.index + 1) % this.items.length;
    this.on_change();
  });
  trig.panel = uiPanel(
    { width: "100%", height: "100%", position: "absolute" },
    panel,
  );
  trig.insert_child(trig.panel);

  trig.text = new uiText({}, text);
  trig.text.text_ref = method(this, function () {
    return this.get_name();
  });
  trig.insert_child(trig.text);

  trig.insert_item = function (name, value, index = trig.items.length) {
    this.items.splice(index, 0, { name: name, value: value });
    this.on_change();
    return this;
  };

  trig.get_name = function () {
    if (this.items.length <= 0) return "";
    const item = this.items[this.index];
    return item.name;
  };

  trig.get_value = function () {
    if (this.items.length <= 0) return "";
    const item = this.items[this.index];
    return item.value;
  };

  trig.set_index = function (index) {
    this.index = clamp(index, 0, this.items.length - 1);
    this.on_change();
    return this;
  };
}

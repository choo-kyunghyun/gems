// global.UIButton = class UIButton extends UIElement {}
function uiButton(style = {}, trigger = {}, panel = {}, text = {}) {
  const parent = uiTrigger(style, trigger);
  const background = uiPanel(
    { width: "100%", height: "100%", position: "absolute" },
    panel,
  );
  const txt = uiText({}, text);
  parent.insert_child(background);
  parent.insert_child(txt);
  return parent;
}

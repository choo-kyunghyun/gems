// global.UITooltip = class UITooltip extends UITrigger {}
function uiTooltip(style = {}, tooltip = {}) {
  const e = uiTrigger(style, {});
  e.text_ref =
    tooltip.text_ref ??
    function () {
      return "";
    };
  e.delay = tooltip.delay ?? 0.2;
  e.elapsed = 0;

  e.on_hover = method(e, function () {
    this.elapsed += Time.raw;
    if (this.elapsed >= this.delay) {
      const str = this.text_ref();
      if (str !== "") Tooltip.set(str);
    }
  });
  e.on_leave = method(e, function () {
    this.elapsed = 0;
  });
}

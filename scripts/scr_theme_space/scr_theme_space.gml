global.space_color = {
    white: #ffffff,
    alabaster: $ccf7f5f5,
    silver: #d1d1d6,
    slate: #2c2c2e,
    grey: #a1a1a1,
    accent: #007aff,
};

global.space_font_weight = {
    regular: 400,
    medium: 500,
    bold: 700,
};

global.space_effect = {
    glass_blur: 12,
    // Note: our primitives don't render borders; we approximate hairline via translucent panels.
    hairline: 0.5
};

// Font selection is handled by I18n in this project.
#macro SPACE_FONT_NORMAL I18n.get_font("normal")
#macro SPACE_FONT_BOLD I18n.get_font("bold")

#region Space theme factories

function space_unpack_color(_col, _default_alpha = 1) {
  // Project uses $aabbggrr packed colors. Primitives expect separate `color` + `alpha`.
  // `color_get_alpha` is provided by `scr_color.gml`.
  return {
    color: _col & $00FFFFFF,
    alpha: is_real(_col) ? color_get_alpha(_col) : _default_alpha,
  };
}

function space_ui_advanced_panel(_style = {}, _panel = {}) {
  // Advanced panel: dark-glass by default for "space aura"
  var _p_style = {
    width: _style[$ "width"] ?? 400,
    padding: _style[$ "padding"] ?? 24,
    gap: _style[$ "gap"] ?? 16,
    flexDirection: _style[$ "flexDirection"] ?? "column",
  };
  return new UIPanel(_p_style, {
    color: _panel[$ "color"] ?? global.space_color.slate,
    alpha: _panel[$ "alpha"] ?? 0.55,
    rad: _panel[$ "rad"] ?? 4,
  });
}

function space_ui_title(_text_ref, _style = {}, _text = {}) {
  // `.title` (uppercase intent left to caller)
  return new UIText(_style, {
    text_ref: _text_ref,
    font: _text[$ "font"] ?? SPACE_FONT_BOLD,
    color: _text[$ "color"] ?? global.space_color.white,
    xscale: _text[$ "xscale"] ?? 1.2,
    yscale: _text[$ "yscale"] ?? 1.2,
  });
}

function space_ui_sub_header(_text_ref, _style = {}, _text = {}) {
  // `.sub-header`
  return new UIText(_style, {
    text_ref: _text_ref,
    font: _text[$ "font"] ?? SPACE_FONT_NORMAL,
    color: _text[$ "color"] ?? global.space_color.grey,
    xscale: _text[$ "xscale"] ?? 0.9,
    yscale: _text[$ "yscale"] ?? 0.9,
  });
}

function space_ui_body_text(_text_ref, _style = {}, _text = {}) {
  // `.body-text`
  return new UIText(_style, {
    text_ref: _text_ref,
    font: _text[$ "font"] ?? SPACE_FONT_NORMAL,
    color: _text[$ "color"] ?? global.space_color.slate,
    xscale: _text[$ "xscale"] ?? 1.0,
    yscale: _text[$ "yscale"] ?? 1.0,
  });
}

function space_ui_data_value(_text_ref, _style = {}, _text = {}) {
  // `.data-value` (monospace not available via I18n yet; caller can pass a font)
  return new UIText(_style, {
    text_ref: _text_ref,
    font: _text[$ "font"] ?? SPACE_FONT_NORMAL,
    color: _text[$ "color"] ?? global.space_color.accent,
    xscale: _text[$ "xscale"] ?? 0.9,
    yscale: _text[$ "yscale"] ?? 0.9,
  });
}

function space_ui_gauge(_value_ref, _style = {}, _gauge = {}) {
  // Styling only: uses `UISlider` for functionality (fill sizing), but locks interaction.
  // Caller supplies `_value_ref`; we update the slider's value via `on_update`.
  var _slider = new UISlider({
    width: _style[$ "width"] ?? "100%",
    height: _style[$ "height"] ?? 6,
  }, {
    min: _gauge[$ "min"] ?? 0,
    max: _gauge[$ "max"] ?? 1,
    value: (_gauge[$ "min"] ?? 0),
    read_only: true,
  }, {
    color: _gauge[$ "bg_color"] ?? global.space_color.silver,
    alpha: _gauge[$ "bg_alpha"] ?? 0.15,
    rad: _gauge[$ "rad"] ?? 0,
  }, {
    color: _gauge[$ "fill_color"] ?? global.space_color.silver,
    alpha: _gauge[$ "fill_alpha"] ?? 1,
    rad: _gauge[$ "rad"] ?? 0,
  }, {
    // Hide thumb for gauge
    color: global.space_color.white,
    alpha: 0,
    rad: _gauge[$ "rad"] ?? 0,
  });

  _slider.on_update = method(_slider, function(_block) {
    self.value = _value_ref();
    return _block;
  });

  return _slider;
}

function space_text_ref(_text_or_ref) {
  // Convenience: accept either a string or a callable returning string.
  if (is_string(_text_or_ref)) return I18n.get_text_ref(_text_or_ref);
  return _text_or_ref;
}

// Back-compat section panel used by title/settings UI
function space_ui_section_panel(_name) {
  // Section panel for options pages: dark background + white text
  var _panel = space_ui_advanced_panel({ width: "100%", padding: 16, gap: 16 }, { rad: 8, color: global.space_color.slate, alpha: 0.45 });
  var _text = space_ui_sub_header(space_text_ref(_name), {}, { color: global.space_color.white, xscale: 1, yscale: 1 });
  _panel.insert_child(_text);
  return _panel;
}

function space_ui_label(_text_ref, _style = {}, _text = {}) {
  return new UIText(_style, {
    text_ref: _text_ref,
    font: _text[$ "font"] ?? SPACE_FONT_NORMAL,
    color: _text[$ "color"] ?? global.space_color.white,
  });
}

function space_ui_button(_text = "", _tooltip = "", _action = noop, _overrides = {}) {
  // Approximates `.interactive-button` (we can’t draw hairline border in primitives yet).
  var _style = _overrides[$ "style"] ?? {
    width: "80%",
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center"
  };

  var _trigger = _overrides[$ "trigger"] ?? {
    on_enter: function() {
      self.panel.alpha = 1;
      self.panel.color = global.space_color.white;
      self.text.color = global.space_color.accent;
      window_set_cursor(cr_handpoint);
    },
    on_leave: function() {
      self.panel.alpha = 0.0;
      self.text.color = global.space_color.white;
      window_set_cursor(cr_default);
    },
    on_down: function() { self.panel.set_width(99, flexpanel_unit.percent); self.panel.set_height(99, flexpanel_unit.percent); },
    on_up: function() { self.panel.set_width(100, flexpanel_unit.percent); self.panel.set_height(100, flexpanel_unit.percent); },
    on_click: _action,
  };

  var _panel = _overrides[$ "panel"] ?? { color: global.space_color.white, alpha: 0.0, rad: 4 };
  var _tip = _overrides[$ "tooltip"] ?? { text_ref: space_text_ref(_tooltip) };
  var _txt = _overrides[$ "text"] ?? { text_ref: space_text_ref(_text), font: SPACE_FONT_NORMAL, color: global.space_color.white };
  return new UIButton(_style, _trigger, _panel, _tip, _txt);
}

function space_ui_checkbox(_text = "", _value = false, _action = noop, _overrides = {}) {
  var _style = _overrides[$ "style"] ?? { width: "80%", justifyContent: "space-between", alignItems: "center", alignSelf: "center", flexDirection: "row" };
  var _check = _overrides[$ "checkbox"] ?? {
    value: _value,
    on_change: _action,
    col0: global.space_color.grey,
    col1: global.space_color.accent,
    size: 22,
    mark_scale: 0.62,
    rad0: 6,
    rad1: 8,
  };
  var _trigger = _overrides[$ "trigger"] ?? {
    on_enter: function() { window_set_cursor(cr_handpoint); },
    on_leave: function() { window_set_cursor(cr_default); },
    on_down: function() { self.indicator.set_width(self.size - 2, flexpanel_unit.point); self.indicator.set_height(self.size - 2, flexpanel_unit.point); },
    on_up: function() { self.indicator.set_width(self.size, flexpanel_unit.point); self.indicator.set_height(self.size, flexpanel_unit.point); },
  };

  var _bg = _overrides[$ "background_panel"] ?? new UIPanel(
    { width: "100%", height: "100%", position: "absolute" },
    { color: global.space_color.slate, alpha: 0.35, rad: 8 }
  );
  var _txt = _overrides[$ "label"] ?? new UIText(
    { marginLeft: 14 },
    { text_ref: space_text_ref(_text), font: SPACE_FONT_NORMAL, color: global.space_color.white }
  );
  // var _box = new UICheckbox(_style, _check, _trigger);
  // _box.insert_child(_bg, 0).insert_child(_txt, 1);
  // return _box;
  return new UIElement();
}

function space_ui_dropdown(_items = [], _index = 0, _on_change = noop, _overrides = {}) {
  // Styling-only wrapper over `UIDropdown`
  var _style = _overrides[$ "style"] ?? { width: "100%", padding: 12, gap: 8, flexDirection: "column" };
  var _dropdown = _overrides[$ "dropdown"] ?? { items: _items, index: _index, on_change: _on_change };

  // Button styling (closed state)
  var _button = _overrides[$ "button"] ?? {
    panel: { color: global.space_color.slate, alpha: 0.35, rad: 8 },
    text: { font: SPACE_FONT_NORMAL, color: global.space_color.white },
    trigger: {
      on_enter: function() { self.panel.alpha = 0.55; window_set_cursor(cr_handpoint); },
      on_leave: function() { self.panel.alpha = 0.35; window_set_cursor(cr_default); },
    }
  };

  // List styling (open state)
  var _list_panel = _overrides[$ "list_panel"] ?? { color: global.space_color.slate, alpha: 0.55, rad: 8 };
  var _item_panel = _overrides[$ "item_panel"] ?? { color: global.space_color.white, alpha: 0.10, rad: 6 };
  var _item_text = _overrides[$ "item_text"] ?? { font: SPACE_FONT_NORMAL, color: global.space_color.white };

  // return new UIDropdown(_style, _dropdown, _button, _list_panel, _item_panel, _item_text);
  return new UIElement();
}

#endregion

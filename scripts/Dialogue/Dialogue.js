// RPG-style paged dialogue box with typewriter reveal. standalone singleton (not UIComponent).
// reveals at `speed` chars/sec on Time.raw; advance with Enter/Space/gamepad-A or click (first snaps
// page to revealed, next pages on; past the last closes + fires onComplete). UINav suspends while open.
// isOpen() is a METHOD not a getter — house style (the old GMRT miscompile report was dismissed).
globalThis.Dialogue = {
  speedDefault: 45, // chars/sec
  lines: 3, // visible text rows (fixed box height; design pages to fit)

  marginX: 24,
  marginBottom: 24,
  maxWidth: 760,
  padX: 22,
  padY: 18,

  panelColor: Color.parse("#1b1e25"),
  panelAlpha: 0.97,
  borderColor: Color.parse("#3c4350"),
  textColor: Color.parse("#f1f4fa"),
  plateColor: Color.parse("#272b34"),
  plateBorder: Color.parse("#4a9eff"),
  speakerColor: Color.parse("#74b6ff"),
  chevronColor: Color.parse("#74b6ff"),
  rad: 10,

  _open: false,
  _pages: [], // { speaker, text }
  _page: 0,
  _chars: 0, // revealed char count (fractional; floored to draw)
  speed: 45, // literal, not Dialogue.speedDefault — an initializer can't
  // self-reference (the global binds after the literal). keep in sync with speedDefault.
  _onComplete: null,

  // wrap cache — recomputed only when page or inner width changes
  _lines: [],
  _total: 0,
  _wrapPage: -1,
  _wrapW: -1,

  // METHOD not a getter — house style, not a runtime dodge.
  isOpen() {
    return Dialogue._open;
  },

  /** @param {(string|{speaker?:string,text:string})[]} pages @param {Object} [opts] { speed, onComplete } */
  start(pages, opts = {}) {
    const list = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (typeof p === "string") list.push({ speaker: null, text: p });
      else list.push({ speaker: p.speaker ?? null, text: p.text ?? "" });
    }
    Dialogue._pages = list;
    Dialogue._page = 0;
    Dialogue._chars = 0;
    Dialogue._onComplete = opts.onComplete ?? noop;
    Dialogue.speed = opts.speed ?? Dialogue.speedDefault;
    Dialogue._wrapPage = -1; // force a re-wrap on the first frame
    Dialogue._open = list.length > 0;
  },

  /** force-close, no onComplete (level swap / abort). */
  clear() {
    Dialogue._open = false;
    Dialogue._pages = [];
  },

  /** typewriter + advance input (Step_0). */
  update() {
    if (!Dialogue._open) return;
    const g = Dialogue._geom();
    Dialogue._ensureWrap(g);

    // typewriter advance (Time.raw, ignores Time.scale)
    Dialogue._chars += Dialogue.speed * Time.raw;
    if (Dialogue._chars > Dialogue._total) Dialogue._chars = Dialogue._total;

    // keyboard/gamepad advance anywhere; LMB only inside the box (so a click on background UI
    // doesn't page too). UIPointer-latched edge, not re-queried — the poll-once rule (UIPointer).
    let advance =
      keyboard_check_pressed(vk_enter) || keyboard_check_pressed(vk_space);
    if (gamepad_is_connected(0) && gamepad_button_check_pressed(0, gp_face1))
      advance = true;
    if (UIPointer.pressed) {
      const mx = device_mouse_x_to_gui(0);
      const my = device_mouse_y_to_gui(0);
      if (mx >= g.x1 && mx <= g.x2 && my >= g.y1 && my <= g.y2) advance = true;
    }
    if (advance) Dialogue._advance();
  },

  _advance() {
    // first press reveals the rest of the page; the next moves on
    if (Dialogue._chars < Dialogue._total) {
      Dialogue._chars = Dialogue._total;
      return;
    }
    Dialogue._page++;
    if (Dialogue._page >= Dialogue._pages.length) {
      const done = Dialogue._onComplete;
      Dialogue._open = false;
      Dialogue._pages = [];
      if (done !== null) done();
    } else {
      Dialogue._chars = 0;
      Dialogue._wrapPage = -1; // re-wrap the new page
    }
  },

  /** draw the box (Draw_75, after Toast). */
  draw() {
    if (!Dialogue._open) return;
    const g = Dialogue._geom();
    Dialogue._ensureWrap(g);

    const font0 = draw_get_font();
    const halign0 = draw_get_halign();
    const valign0 = draw_get_valign();
    const alpha0 = draw_get_alpha();
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);

    // panel fill + border
    draw_set_alpha(Dialogue.panelAlpha);
    draw_roundrect_color_ext(
      g.x1,
      g.y1,
      g.x2,
      g.y2,
      Dialogue.rad,
      Dialogue.rad,
      Dialogue.panelColor,
      Dialogue.panelColor,
      false,
    );
    draw_set_alpha(1);
    draw_roundrect_color_ext(
      g.x1,
      g.y1,
      g.x2,
      g.y2,
      Dialogue.rad,
      Dialogue.rad,
      Dialogue.borderColor,
      Dialogue.borderColor,
      true,
    );

    // speaker name plate on the box's top-left edge
    const speaker = Dialogue._pages[Dialogue._page].speaker;
    if (speaker !== null && speaker !== "") {
      const tw = string_width(speaker);
      const plateH = g.lineH + 10;
      const px1 = g.x1 + 14;
      const px2 = px1 + tw + 24;
      const py2 = g.y1 + 2;
      const py1 = py2 - plateH;
      draw_roundrect_color_ext(
        px1,
        py1,
        px2,
        py2,
        8,
        8,
        Dialogue.plateColor,
        Dialogue.plateColor,
        false,
      );
      draw_roundrect_color_ext(
        px1,
        py1,
        px2,
        py2,
        8,
        8,
        Dialogue.plateBorder,
        Dialogue.plateBorder,
        true,
      );
      draw_text_color(
        px1 + 12,
        py1 + 5,
        speaker,
        Dialogue.speakerColor,
        Dialogue.speakerColor,
        Dialogue.speakerColor,
        Dialogue.speakerColor,
        1,
      );
    }

    // revealed body text — count a substring across pre-wrapped lines
    const n = floor(Dialogue._chars);
    const lines = Dialogue._lines;
    let shown = 0;
    const c = Dialogue.textColor;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const take = clamp(n - shown, 0, line.length);
      if (take > 0) {
        const sub = line.substring(0, take);
        draw_text_color(g.innerX, g.innerY + i * g.lineH, sub, c, c, c, c, 1);
      }
      shown += line.length;
    }

    // blinking advance chevron once the page is fully revealed
    if (
      Dialogue._chars >= Dialogue._total &&
      floor(current_time / 450) % 2 === 0
    ) {
      const ah = 5;
      drawUIArrow(
        g.x2 - Dialogue.padX - ah,
        g.y2 - 6 - ah,
        "down",
        ah,
        Dialogue.chevronColor,
      );
    }

    draw_set_font(font0);
    draw_set_halign(halign0);
    draw_set_valign(valign0);
    draw_set_alpha(alpha0);
  },

  // box rect (centered, bottom-anchored) + inner text metrics
  _geom() {
    const gw = display_get_gui_width();
    const gh = display_get_gui_height();
    const w = Math.min(gw - Dialogue.marginX * 2, Dialogue.maxWidth);
    const lineH = string_height("Mg");
    const h = Dialogue.lines * lineH + Dialogue.padY * 2;
    const x1 = (gw - w) * 0.5;
    const y2 = gh - Dialogue.marginBottom;
    const y1 = y2 - h;
    return {
      x1,
      y1,
      x2: x1 + w,
      y2,
      innerX: x1 + Dialogue.padX,
      innerY: y1 + Dialogue.padY,
      innerW: w - Dialogue.padX * 2,
      lineH,
    };
  },

  _ensureWrap(g) {
    if (Dialogue._wrapPage === Dialogue._page && Dialogue._wrapW === g.innerW)
      return;
    Dialogue._lines = Dialogue._wrap(
      Dialogue._pages[Dialogue._page].text,
      g.innerW,
    );
    let total = 0;
    for (let i = 0; i < Dialogue._lines.length; i++)
      total += Dialogue._lines[i].length;
    Dialogue._total = total;
    Dialogue._wrapPage = Dialogue._page;
    Dialogue._wrapW = g.innerW;
  },

  // greedy word-wrap to `maxW`, honoring "\n". fixed here so the typewriter has a stable layout.
  _wrap(text, maxW) {
    const lines = [];
    const paras = text.split("\n");
    for (let p = 0; p < paras.length; p++) {
      const words = paras[p].split(" ");
      let cur = "";
      for (let i = 0; i < words.length; i++) {
        const probe = cur === "" ? words[i] : cur + " " + words[i];
        if (cur !== "" && string_width(probe) > maxW) {
          lines.push(cur);
          cur = words[i];
        } else {
          cur = probe;
        }
      }
      lines.push(cur);
    }
    return lines;
  },
};

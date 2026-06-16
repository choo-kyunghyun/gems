/**
 * Dialogue — an RPG-style paged dialogue box with typewriter reveal. Standalone
 * static singleton (NOT a UIComponent), like Tooltip / Toast / VirtualKeyboard /
 * SceneTransition. Game code drives it imperatively:
 *
 *   Dialogue.start(
 *     [
 *       "A plain narrator line.",
 *       { speaker: "Hana", text: "A line with a speaker name plate." },
 *     ],
 *     { speed: 45, onComplete: () => ... },
 *   );
 *
 * Each page's text reveals character-by-character at `speed` chars/sec (wall-clock,
 * Time.raw — so it ignores Time.scale like the rest of the UI). Advance with
 * Enter / Space / gamepad A, or by clicking the box: the first advance snaps the
 * current page to fully revealed, the next moves to the following page; advancing
 * past the last page closes and fires `onComplete`.
 *
 * Wiring: `Dialogue.update()` in obj_game Step_0 (typewriter timing + advance input),
 * `Dialogue.draw()` in Draw_75 (after Toast), `Dialogue.clear()` on every scene swap.
 * While it's open, UINav suspends (it owns Enter/A) — see UINav.update.
 *
 * GMRT notes: the box is sized off display_get_gui_* (never a flexpanel rect), so there's no
 * NaN-width hazard and no `!(pos.width > 0)` guard. The advance indicator is a filled
 * down-triangle via drawUIArrow (like UIAccordion/UISelect). Reveal counts a JS substring of
 * pre-wrapped lines, no Map/Set iteration. isOpen() is a METHOD, not a static getter (static
 * getters miscompile for computed state on GMRT 0.20 — see CLAUDE.md).
 */
globalThis.Dialogue = class Dialogue {
  static speedDefault = 45; // chars/sec
  static lines = 3; // visible text rows (fixed box height; design pages to fit)

  static marginX = 24;
  static marginBottom = 24;
  static maxWidth = 760;
  static padX = 22;
  static padY = 18;

  static panelColor = Color.parse("#1b1e25");
  static panelAlpha = 0.97;
  static borderColor = Color.parse("#3c4350");
  static textColor = Color.parse("#f1f4fa");
  static plateColor = Color.parse("#272b34");
  static plateBorder = Color.parse("#4a9eff");
  static speakerColor = Color.parse("#74b6ff");
  static chevronColor = Color.parse("#74b6ff");
  static rad = 10;

  static _open = false;
  static _pages = []; // { speaker, text }
  static _page = 0;
  static _chars = 0; // revealed character count (fractional; floored to draw)
  static speed = 45; // literal: a static initializer can't reference the class name
  // (the `Dialogue` binding isn't live during class evaluation on GMRT) — kept in
  // sync with speedDefault; methods below read Dialogue.speedDefault freely.
  static _onComplete = null;

  // Wrap cache — recomputed only when the page or the inner width changes.
  static _lines = [];
  static _total = 0;
  static _wrapPage = -1;
  static _wrapW = -1;

  // A METHOD, not a `static get` — kept as a method for consistency with SystemMenu /
  // VirtualKeyboard, whose comparison-body static getters miscompile on GMRT 0.20 (see
  // CLAUDE.md). True while a dialogue is showing — read by UINav (to suspend) + game code.
  static isOpen() {
    return Dialogue._open;
  }

  /**
   * Open a dialogue. @param {(string|{speaker?:string,text:string})[]} pages
   * @param {Object} [opts] { speed (chars/sec), onComplete }
   */
  static start(pages, opts = {}) {
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
  }

  /** Force-close with no onComplete (scene swap / abort). */
  static clear() {
    Dialogue._open = false;
    Dialogue._pages = [];
  }

  /** Advance the typewriter + handle advance input (Step_0). */
  static update() {
    if (!Dialogue._open) return;
    const g = Dialogue._geom();
    Dialogue._ensureWrap(g);

    // Typewriter advance (wall-clock, ignores Time.scale).
    Dialogue._chars += Dialogue.speed * Time.raw;
    if (Dialogue._chars > Dialogue._total) Dialogue._chars = Dialogue._total;

    // Keyboard/gamepad advance anywhere; the LMB edge (latched by UIPointer, not re-queried
    // — mouse edges flicker if re-read, see CLAUDE.md) advances only inside the box, so a
    // click on background UI doesn't also page the dialogue.
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
  }

  static _advance() {
    // First press reveals the rest of the page; the next moves on.
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
  }

  /** Draw the dialogue box (Draw_75, after Toast). */
  static draw() {
    if (!Dialogue._open) return;
    const g = Dialogue._geom();
    Dialogue._ensureWrap(g);

    const font0 = draw_get_font();
    const halign0 = draw_get_halign();
    const valign0 = draw_get_valign();
    const alpha0 = draw_get_alpha();
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);

    // Panel fill + border.
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

    // Speaker name plate, tucked onto the box's top-left edge.
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

    // Revealed body text — count a substring across the pre-wrapped lines.
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

    // Blinking advance chevron (down triangle, via drawUIArrow) once the page is fully revealed.
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
  }

  // Box rectangle (centered, bottom-anchored) + inner text metrics.
  static _geom() {
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
  }

  static _ensureWrap(g) {
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
  }

  // Greedy word-wrap to `maxW`, honoring explicit "\n" breaks. Lines are fixed once
  // here so the typewriter reveals along a stable layout (no reflow jiggle).
  static _wrap(text, maxW) {
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
  }
};

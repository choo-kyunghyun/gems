/**
 * UINav — keyboard/gamepad menu navigation over the UI tree. Standalone static
 * singleton (NOT a UIComponent), like Tooltip / Toast / SlotDrag.
 *
 * It touches neither UI nor UIElement: an element is "focusable" iff one of its
 * components implements a nav hook — `navActivate(element)` (the confirm action)
 * and/or `navAxis(element, dir)` (horizontal adjust, dir = -1 left / +1 right). Each
 * frame UINav walks the enabled roots, collects focusable elements with a valid
 * (laid-out, on-screen, not scrolled-away) rect, and:
 *   - on a directional press (arrows / dpad / left stick) moves focus to the
 *     geometrically nearest focusable in that direction;
 *   - on a horizontal press, if the focused widget has `navAxis` it tweaks it
 *     (slider/select/stepper) instead of moving focus;
 *   - on confirm (Enter / Space / gamepad A) calls `navActivate`;
 *   - on cancel (Esc / gamepad B) disengages (hides the ring).
 *
 * Engagement: the focus ring shows only once "engaged" — the first nav input engages
 * and focuses but doesn't also act; moving the mouse disengages so pointer and pad
 * don't fight. While a UIInput is being typed (`UIInput.active` set) UINav ignores its
 * keys so the caret keeps the arrows/Enter.
 *
 * Wiring: `UINav.update()` in Step_0 (after `UI.update()`, before the pending-scene
 * swap so a confirm that calls openScene transitions this frame); `UINav.draw()` in
 * Draw_75. GMRT: each edge query is read once per frame; the ring pulse uses wall-clock
 * time (UI ignores Time.scale); no Map/Set iteration, no cached primitive bool.
 */
globalThis.UINav = class UINav {
  /** @type {UIElement|null} */
  static focused = null; // the focused element, or null
  static engaged = false; // ring visible / nav acting (set on first nav input)
  static color = c_aqua; // focus-ring color (overridden by the demo theme)
  static debugKey = vk_tab; // hold to show the traversal overlay (-1 disables)

  static _mx = 0; // last mouse pos — movement disengages
  static _my = 0;
  static _stickX = 0; // left-stick re-arm latches (0 = armed)
  static _stickY = 0;

  static reset() {
    UINav.focused = null;
    UINav.engaged = false;
  }

  static update() {
    const items = UINav._collect();
    if (items.length === 0) {
      UINav.focused = null;
      return;
    }

    // Drop focus if the focused element vanished (scene / tab change).
    if (UINav.focused !== null && UINav._indexOf(items, UINav.focused) === -1) {
      UINav.focused = null;
    }

    // Mouse movement hands control back to the pointer (ring hidden).
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    if (mx !== UINav._mx || my !== UINav._my) {
      UINav._mx = mx;
      UINav._my = my;
      UINav.engaged = false;
    }

    // Suspend while typing — let the caret keep arrows / Enter.
    if (UIInput.active !== null) return;

    const inp = UINav._readInput();
    if (inp.cancel) {
      UINav.engaged = false;
      return;
    }
    if (inp.dx === 0 && inp.dy === 0 && !inp.confirm) return;

    // The first nav input only engages + focuses; it doesn't also act.
    if (!UINav.engaged || UINav.focused === null) {
      UINav.engaged = true;
      if (UINav.focused === null) {
        UINav.focused = items[0].el;
        UINav._scrollIntoView(UINav.focused);
      }
      return;
    }

    if (inp.confirm) {
      const comp = UINav._comp(UINav.focused, "navActivate");
      if (comp !== null) comp.navActivate(UINav.focused);
      return;
    }

    // Horizontal over a widget that consumes it adjusts; otherwise move focus.
    if (inp.dx !== 0) {
      const comp = UINav._comp(UINav.focused, "navAxis");
      if (comp !== null) {
        comp.navAxis(UINav.focused, inp.dx);
        return;
      }
    }
    UINav._move(items, inp.dx, inp.dy);
  }

  static draw() {
    // Debug: hold UINav.debugKey (Tab) to overlay the traversal order + the four
    // directional targets from the focused element — to diagnose awkward routing.
    if (UINav.debugKey !== -1 && keyboard_check(UINav.debugKey)) {
      UINav._drawDebug();
    }

    if (!UINav.engaged || UINav.focused === null) return;
    if (UINav.focused._destroyed) return;
    const pos = UINav.focused.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width

    // Pulsing 2px outline just outside the focused element's rect.
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * sin(current_time * 0.006));
    const m = 3;
    const x1 = pos.left - m;
    const y1 = pos.top - m;
    const x2 = pos.left + pos.width + m;
    const y2 = pos.top + pos.height + m;
    const a0 = draw_get_alpha();
    draw_set_alpha(pulse);
    for (let i = 0; i < 2; i++) {
      draw_roundrect_color_ext(
        x1 - i,
        y1 - i,
        x2 + i,
        y2 + i,
        8,
        8,
        UINav.color,
        UINav.color,
        true,
      );
    }
    draw_set_alpha(a0);
  }

  // Debug overlay: number every focusable in collection order and, from the focused
  // element, draw a labelled line to each direction's target (U/D/L/R) using the same
  // _pick the real moves use — so you can see exactly where each press would go.
  static _drawDebug() {
    const items = UINav._collect();
    if (items.length === 0) return;

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();
    const a0 = draw_get_alpha();
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);

    const fi = UINav._indexOf(items, UINav.focused);

    // Each focusable: a numbered outline (the focused one brighter).
    for (let k = 0; k < items.length; k++) {
      const pos = items[k].el.getLayoutPosition();
      if (!(pos.width > 0)) continue;
      const on = k === fi;
      draw_set_alpha(on ? 0.9 : 0.5);
      const c = on ? c_yellow : c_orange;
      draw_rectangle_color(
        pos.left,
        pos.top,
        pos.left + pos.width,
        pos.top + pos.height,
        c,
        c,
        c,
        c,
        true,
      );
      draw_set_alpha(1);
      draw_text_color(pos.left + 3, pos.top + 2, string(k), c, c, c, c, 1);
    }

    // Directional targets from the focused element. Left/right are skipped when the
    // widget consumes the horizontal axis (navAxis: slider/select/stepper/tabs) — those
    // adjust the value rather than move focus, so a target line would mislead.
    if (fi !== -1) {
      const fx = items[fi].cx;
      const fy = items[fi].cy;
      const consumesAxis = UINav._comp(UINav.focused, "navAxis") !== null;
      // dx, dy, label, color.
      const dirs = [
        [0, -1, "U", c_red],
        [0, 1, "D", c_lime],
        [-1, 0, "L", c_aqua],
        [1, 0, "R", c_fuchsia],
      ];
      for (let d = 0; d < dirs.length; d++) {
        if (dirs[d][0] !== 0 && consumesAxis) continue; // horizontal handled by navAxis
        const j = UINav._pick(items, fi, dirs[d][0], dirs[d][1]);
        if (j === -1) continue;
        const tx = items[j].cx;
        const ty = items[j].cy;
        const col = dirs[d][3];
        draw_line_width_color(fx, fy, tx, ty, 2, col, col);
        draw_set_color(col);
        draw_text(
          (fx + tx) * 0.5 + 4,
          (fy + ty) * 0.5,
          dirs[d][2] + ">" + string(j),
        );
      }
    }

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
    draw_set_alpha(a0);
  }

  // ── internals ──────────────────────────────────────────────────
  // Walk roots top-down (highest index first); stop after an exclusive (modal) root
  // so focusables on the roots beneath it aren't collected — mirroring the modal's
  // pointer block, so nav can't reach the background while a dialog is open.
  static _collect() {
    const out = [];
    for (let i = UI.roots.length - 1; i >= 0; i--) {
      const r = UI.roots[i];
      if (!r.enabled) continue;
      UINav._walk(r, out);
      if (UINav._exclusive(r)) break;
    }
    return out;
  }

  static _exclusive(el) {
    for (let i = 0; i < el.components.length; i++) {
      const c = el.components[i];
      if (typeof c.navExclusive === "function" && c.navExclusive()) return true;
    }
    return false;
  }

  static _walk(el, out) {
    if (el._destroyed) return;
    if (UINav._focusable(el) && UINav._visible(el)) {
      const pos = el.getLayoutPosition();
      out.push({
        el,
        left: pos.left,
        top: pos.top,
        right: pos.left + pos.width,
        bottom: pos.top + pos.height,
        cx: pos.left + pos.width * 0.5,
        cy: pos.top + pos.height * 0.5,
      });
    }
    for (let i = 0; i < el.children.length; i++) {
      if (el.children[i].enabled) UINav._walk(el.children[i], out);
    }
  }

  static _focusable(el) {
    return (
      UINav._comp(el, "navActivate") !== null ||
      UINav._comp(el, "navAxis") !== null
    );
  }

  static _comp(el, method) {
    for (let i = 0; i < el.components.length; i++) {
      if (typeof el.components[i][method] === "function") {
        return el.components[i];
      }
    }
    return null;
  }

  // A laid-out element (valid, non-zero rect). NOTE: scrolled-out items in a UIScroll
  // are intentionally still focusable — nav scrolls them into view on focus (see
  // _scrollIntoView), otherwise a list taller than its viewport would be unreachable
  // without the mouse. Disabled subtrees are already skipped in _walk.
  static _visible(el) {
    const pos = el.getLayoutPosition();
    return pos.width > 0 && pos.height > 0;
  }

  // Bring `el` into view inside each UIScroll ancestor by nudging its scroll, so the
  // scroll follows keyboard/gamepad focus.
  static _scrollIntoView(el) {
    let p = el.parent;
    while (p !== null) {
      const sc = p.getComponent(UIScroll);
      if (sc !== undefined) UINav._scrollOne(sc, p, el);
      p = p.parent;
    }
  }

  static _scrollOne(sc, viewport, el) {
    const vp = viewport.getLayoutPosition(); // window (own scrollY not applied to self)
    const fp = el.getLayoutPosition(); // already offset by the current scroll
    const margin = 8;
    let delta = 0;
    if (fp.top < vp.top + margin) {
      delta = fp.top - (vp.top + margin); // above the window → scroll up (negative)
    } else if (fp.top + fp.height > vp.top + vp.height - margin) {
      delta = fp.top + fp.height - (vp.top + vp.height - margin); // below → scroll down
    }
    if (delta === 0) return;
    const contentH = sc.content ? sc.content.getLayoutPosition().height : 0;
    const max = Math.max(0, contentH - vp.height);
    sc.scroll = clamp(sc.scroll + delta, 0, max);
    viewport.scrollY = sc.scroll; // apply now so the ring + next layout reflect it
  }

  static _indexOf(items, el) {
    for (let i = 0; i < items.length; i++) if (items[i].el === el) return i;
    return -1;
  }

  // Move focus to the nearest focusable in direction (dx, dy).
  static _move(items, dx, dy) {
    const i = UINav._indexOf(items, UINav.focused);
    if (i === -1) {
      UINav.focused = items[0].el;
      UINav._scrollIntoView(UINav.focused);
      return;
    }
    const best = UINav._pick(items, i, dx, dy);
    if (best !== -1) {
      UINav.focused = items[best].el;
      UINav._scrollIntoView(UINav.focused);
    }
  }

  // Index of the focusable that (dx, dy) from item `i` lands on, or -1. Edge-aware so
  // wide elements route by reading order, not screen-center: `primary` is the
  // dir-axis distance between centers; `perp` is the GAP between the two rects on the
  // cross axis (0 when they overlap there). A full-width row therefore overlaps every
  // item below it (perp 0), so Down picks the leftmost one (ties break by collection
  // order = visual order) instead of whichever happens to sit nearest mid-screen.
  // Shared by _move and the debug overlay so the picture matches behavior exactly.
  static _pick(items, i, dx, dy) {
    const s = items[i];
    let best = -1;
    let bestScore = Infinity;
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      const t = items[j];
      const primary = (t.cx - s.cx) * dx + (t.cy - s.cy) * dy; // center dist along dir
      if (primary <= 0) continue; // not ahead in this direction
      const perp =
        dy !== 0
          ? max(0, s.left - t.right, t.left - s.right) // vertical move → horizontal gap
          : max(0, s.top - t.bottom, t.top - s.bottom); // horizontal move → vertical gap
      const score = primary + perp * 2;
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    return best;
  }

  static _readInput() {
    let dx = 0;
    let dy = 0;
    let confirm = false;
    let cancel = false;

    if (keyboard_check_pressed(vk_left)) dx = -1;
    else if (keyboard_check_pressed(vk_right)) dx = 1;
    if (keyboard_check_pressed(vk_up)) dy = -1;
    else if (keyboard_check_pressed(vk_down)) dy = 1;
    if (keyboard_check_pressed(vk_enter) || keyboard_check_pressed(vk_space))
      confirm = true;
    if (keyboard_check_pressed(vk_escape)) cancel = true;

    if (gamepad_is_connected(0)) {
      if (gamepad_button_check_pressed(0, gp_padl)) dx = -1;
      else if (gamepad_button_check_pressed(0, gp_padr)) dx = 1;
      if (gamepad_button_check_pressed(0, gp_padu)) dy = -1;
      else if (gamepad_button_check_pressed(0, gp_padd)) dy = 1;
      if (gamepad_button_check_pressed(0, gp_face1)) confirm = true;
      if (gamepad_button_check_pressed(0, gp_face2)) cancel = true;

      // Left stick → debounced edges: re-arm under 0.4, fire over 0.6.
      const ax = gamepad_axis_value(0, gp_axislh);
      const ay = gamepad_axis_value(0, gp_axislv);
      if (abs(ax) < 0.4) UINav._stickX = 0;
      else if (UINav._stickX === 0 && abs(ax) > 0.6) {
        dx = ax < 0 ? -1 : 1;
        UINav._stickX = dx;
      }
      if (abs(ay) < 0.4) UINav._stickY = 0;
      else if (UINav._stickY === 0 && abs(ay) > 0.6) {
        dy = ay < 0 ? -1 : 1;
        UINav._stickY = dy;
      }
    }

    return { dx, dy, confirm, cancel };
  }
};

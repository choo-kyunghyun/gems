// UINav — keyboard/gamepad menu navigation. Static singleton, not a UIComponent.
// An element is focusable via navActivate(el) (confirm) and/or navAxis(el, dir) (adjust).
// GMRT: edge queries read once per frame; ring pulse uses Time.raw; no Map/Set iteration,
// no cached primitive bool.
globalThis.UINav = class UINav {
  /** @type {UIElement|null} */
  static focused = null;
  static engaged = false; // ring visible; set on first nav input
  static suspended = false; // genre scenes set this so gameplay keys don't drive the menu
  static color = c_aqua; // focus-ring color (overridden by demo theme)
  static debugKey = vk_tab; // hold to show traversal overlay (-1 disables)

  static _mx = 0; // last mouse pos — movement disengages
  static _my = 0;
  static _stickX = 0; // left-stick re-arm latches (0 = armed)
  static _stickY = 0;

  // browse-mode key claim: a widget that owns the arrows this frame (UITable/UISlots browse)
  // re-asserts claimKeys(this) EVERY frame; update() consumes it once per frame, so a stale
  // claim self-heals the moment the owner stops updating.
  /** @type {Object|null} */
  static _claimed = null;

  /** claim the nav keys for this frame — call every frame browse mode stays latched. @param {Object} owner */
  static claimKeys(owner) {
    UINav._claimed = owner;
  }

  /** release on owner teardown so a claim asserted earlier this frame can't outlive it. @param {Object} owner */
  static releaseClaim(owner) {
    if (UINav._claimed === owner) UINav._claimed = null;
  }

  /** Reset on every scene swap. */
  static reset() {
    UINav.focused = null;
    UINav.engaged = false;
    UINav.suspended = false;
    UINav._claimed = null;
  }

  /** Per-frame nav tick (Step_0, after UI.update). */
  static update() {
    // gameplay owns the keys while suspended — don't collect or act
    if (UINav.suspended) {
      UINav.engaged = false;
      UINav.focused = null;
      return;
    }

    const items = UINav._collect();
    if (items.length === 0) {
      UINav.focused = null;
      return;
    }

    // drop stale focus (scene/tab change)
    if (UINav.focused !== null && UINav._indexOf(items, UINav.focused) === -1) {
      UINav.focused = null;
    }

    // mouse movement disengages (ring hidden)
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    if (mx !== UINav._mx || my !== UINav._my) {
      UINav._mx = mx;
      UINav._my = my;
      UINav.engaged = false;
    }

    if (UIInput.active !== null) return; // caret keeps arrows/Enter while typing
    if (UINav._claimed !== null) {
      UINav._claimed = null; // consume — the browse-mode owner re-asserts each frame
      return;
    }
    if (Dialogue.isOpen()) return; // dialogue owns Enter/arrows for page advance

    const inp = UINav._readInput();
    if (inp.cancel) {
      UINav.engaged = false;
      return;
    }
    if (inp.dx === 0 && inp.dy === 0 && !inp.confirm) return;

    // first nav input only engages — doesn't also act
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
      if (comp !== null) {
        Audio.play("snd_button_click"); // cue before activate (which may swap scene)
        comp.navActivate(UINav.focused);
      }
      return;
    }

    // horizontal adjusts a navAxis widget (slider/select/stepper); otherwise moves focus
    if (inp.dx !== 0) {
      const comp = UINav._comp(UINav.focused, "navAxis");
      if (comp !== null) {
        comp.navAxis(UINav.focused, inp.dx);
        return;
      }
    }
    // cue only on an actual focus change (input is already press-edged, so one cue per press)
    const prevFocus = UINav.focused;
    UINav._move(items, inp.dx, inp.dy);
    if (UINav.focused !== prevFocus) Audio.play("snd_button_muted");
  }

  /** Draw the focus ring (Draw_75); Tab debug overlay when held. */
  static draw() {
    if (UINav.debugKey !== -1 && keyboard_check(UINav.debugKey)) {
      UINav._drawDebug();
    }

    if (!UINav.engaged || UINav.focused === null) return;
    if (UINav.focused._destroyed) return;
    const pos = UINav.focused.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * sin(current_time * 0.006));
    const m = 3;
    const x1 = pos.left - m;
    const y1 = pos.top - m;
    const x2 = pos.left + pos.width + m;
    const y2 = pos.top + pos.height + m;
    const a0 = draw_get_alpha();
    draw_set_alpha(pulse);
    // pass the 1px-grown rect: the helper's inward insets land on the same two rects the
    // old outward-growing loop drew.
    drawUIOutline(x1 - 1, y1 - 1, x2 + 1, y2 + 1, 8, UINav.color, 2);
    draw_set_alpha(a0);
  }

  // debug overlay: numbered focusables + directional target lines matching real _pick behavior
  static _drawDebug() {
    const items = UINav._collect();
    if (items.length === 0) return;

    const st = uiDrawSave();
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);

    const fi = UINav._indexOf(items, UINav.focused);

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

    // skip horizontal target lines when navAxis consumes them (would mislead)
    if (fi !== -1) {
      const fx = items[fi].cx;
      const fy = items[fi].cy;
      const consumesAxis = UINav._comp(UINav.focused, "navAxis") !== null;
      const dirs = [
        // dx, dy, label, color
        [0, -1, "U", c_red],
        [0, 1, "D", c_lime],
        [-1, 0, "L", c_aqua],
        [1, 0, "R", c_fuchsia],
      ];
      for (let d = 0; d < dirs.length; d++) {
        if (dirs[d][0] !== 0 && consumesAxis) continue; // navAxis handles horizontal
        const j = UINav._pick(items, fi, dirs[d][0], dirs[d][1]);
        if (j === -1) continue;
        const tx = items[j].cx;
        const ty = items[j].cy;
        const col = dirs[d][3];
        UINav._dirLine(fx, fy, tx, ty, col);
        draw_set_color(col);
        draw_text(
          (fx + tx) * 0.5 + 4,
          (fy + ty) * 0.5,
          dirs[d][2] + ">" + string(j),
        );
      }
    }

    uiDrawRestore(st);
  }

  static _dirLine(x1, y1, x2, y2, col) {
    draw_line_width_color(x1, y1, x2, y2, 2, col, col);
  }

  // walk roots top-down; stop at an exclusive (modal) root so nav can't reach the background
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

  // valid non-zero rect. scrolled-out UIScroll items stay focusable (nav scrolls them into
  // view via _scrollIntoView), else a list taller than its viewport is unreachable by pad.
  static _visible(el) {
    const pos = el.getLayoutPosition();
    return pos.width > 0 && pos.height > 0;
  }

  // nudge each UIScroll ancestor so it follows focus
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

  // Nearest focusable from `i` along (dx, dy), or -1. Edge-aware: `primary` = center
  // distance along dir, `perp` = cross-axis GAP between rects (0 when overlapping). So a
  // full-width row overlaps everything below it and Down picks the leftmost (ties by
  // collection order = visual order), not whatever sits nearest mid-screen.
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

  /**
   * discrete directional edge read (keyboard arrows + dpad + Enter/Space/face1 confirm +
   * Esc/face2 cancel) — the shared core used by nav itself and by browse-mode widgets
   * (UITable/UISlots) while they hold the key claim. Analog-stick handling stays in
   * _readInput (it needs the per-frame re-arm latches).
   * @returns {{dx:number, dy:number, confirm:boolean, cancel:boolean}}
   */
  static readEdge() {
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
    }

    return { dx, dy, confirm, cancel };
  }

  static _readInput() {
    const e = UINav.readEdge();
    if (gamepad_is_connected(0)) {
      // Left stick → debounced edges: re-arm under 0.4, fire over 0.6.
      const ax = gamepad_axis_value(0, gp_axislh);
      const ay = gamepad_axis_value(0, gp_axislv);
      if (abs(ax) < 0.4) UINav._stickX = 0;
      else if (UINav._stickX === 0 && abs(ax) > 0.6) {
        e.dx = ax < 0 ? -1 : 1;
        UINav._stickX = e.dx;
      }
      if (abs(ay) < 0.4) UINav._stickY = 0;
      else if (UINav._stickY === 0 && abs(ay) > 0.6) {
        e.dy = ay < 0 ? -1 : 1;
        UINav._stickY = e.dy;
      }
    }
    return e;
  }
};

/**
 * One frame's nav input. `dx`/`dy` are the move's direction, 0 on a confirm or a cancel.
 * @typedef {Object} UINavEvent
 * @property {"move"|"confirm"|"cancel"} kind
 * @property {number} dx
 * @property {number} dy
 */

/**
 * Keyboard/gamepad menu navigation over the focusable widgets of the UI roots, stopping at an
 * exclusive (modal) root. The first nav input only engages the focus ring; pointer movement
 * disengages it. While live it claims the gamepad, so gameplay pad bindings read idle.
 *
 * A frame's input is one {UINavEvent}, offered to the focused element and then up its ancestors
 * until a component's `onNav(element, event)` returns true; only an unhandled event falls to the
 * nav's own focus move or ring release. The nav voices the input itself — a taken confirm
 * clicks, a focus move ticks — so a handler plays nothing. A component with `focusable: true`
 * makes its element a focus stop.
 *
 * TODO: retire `navActivate`/`navAxis`, which still answer a confirm and a horizontal move on the
 * focused element itself and make it a stop, once every widget answers `onNav`.
 */
globalThis.UINav = {
  focused: null,
  engaged: false, // ring visible
  suspended: false, // gameplay keys don't drive the menu
  color: c_aqua,
  debugKey: vk_tab, // hold to show the traversal overlay (-1 disables)

  _stickX: 0, // left-stick re-arm latches (0 = armed)
  _stickY: 0,

  /** Reset on every scene swap. */
  reset() {
    UINav.focused = null;
    UINav.engaged = false;
    UINav.suspended = false;
  },

  /**
   * Per-frame tick, after the UI update: read and act, then, while live, claim the gamepad so the
   * scene's pad bindings read idle. The claim comes after the reads, never before.
   */
  update() {
    UINav._tick();
    if (!UINav.suspended) Input.claimPad();
  },

  _tick() {
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

    if (UINav.focused !== null && UINav._indexOf(items, UINav.focused) === -1) {
      UINav.focused = null;
    }

    if (Input.pointer.moved) UINav.engaged = false;

    if (UIInput.active !== null) return; // caret keeps arrows/Enter while typing
    if (Dialogue.isOpen()) return; // dialogue owns Enter/arrows for page advance

    const ev = UINav._event(UINav._readInput());
    if (ev === null) return;
    const live = UINav.engaged ? UINav.focused !== null : false;

    if (ev.kind === "cancel") {
      if (live ? !UINav._dispatch(ev) : true) UINav.engaged = false;
      return;
    }

    // the first nav input only engages, never also acts
    if (!live) {
      UINav.engaged = true;
      if (UINav.focused === null) {
        UINav.focused = items[0].el;
        UINav._scrollIntoView(UINav.focused);
      }
      return;
    }

    if (UINav._dispatch(ev)) {
      if (ev.kind === "confirm") Audio.play({ sound: sndButtonClick });
      return;
    }
    if (ev.kind === "move") {
      const prevFocus = UINav.focused;
      UINav._move(items, ev.dx, ev.dy);
      if (UINav.focused !== prevFocus) Audio.play({ sound: sndButtonMuted });
    }
  },

  /** The frame's one event, a cancel over a confirm over a move; null when idle. */
  _event(inp) {
    if (inp.cancel) return { kind: "cancel", dx: 0, dy: 0 };
    if (inp.confirm) return { kind: "confirm", dx: 0, dy: 0 };
    if (inp.dx === 0 ? inp.dy === 0 : false) return null;
    return { kind: "move", dx: inp.dx, dy: inp.dy };
  },

  /** Offers `ev` from the focused element up its ancestors; true once a component took it. */
  _dispatch(ev) {
    const focused = UINav.focused;
    let el = focused;
    while (el !== null) {
      if (el._destroyed) return true; // a handler tore its subtree down: nothing left to offer
      const comps = el.components;
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        if (typeof c.onNav === "function") {
          if (c.onNav(el, ev) === true) return true;
        } else if (el === focused) {
          if (UINav._legacy(c, el, ev)) return true;
        }
      }
      el = el.parent;
    }
    return false;
  },

  _legacy(c, el, ev) {
    if (ev.kind === "confirm") {
      if (typeof c.navActivate !== "function") return false;
      c.navActivate(el);
      return true;
    }
    if (ev.kind !== "move" || ev.dx === 0) return false;
    if (typeof c.navAxis !== "function") return false;
    c.navAxis(el, ev.dx);
    return true;
  },

  /** Draw the focus ring, and the debug overlay while its key is held. */
  draw() {
    if (UINav.debugKey !== -1 && Input.keyDown(UINav.debugKey)) {
      UINav._drawDebug();
    }

    if (!UINav.engaged || UINav.focused === null) return;
    if (UINav.focused._destroyed) return;
    const pos = UINav.focused.getLayoutPosition();
    if (!(pos.width > 0)) return; // not laid out (NaN) or zero-width
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * sin(current_time * 0.006));
    const m = 3;
    const x1 = pos.left - m;
    const y1 = pos.top - m;
    const x2 = pos.left + pos.width + m;
    const y2 = pos.top + pos.height + m;
    const a0 = draw_get_alpha();
    draw_set_alpha(pulse);
    UIDraw.outline(x1 - 1, y1 - 1, x2 + 1, y2 + 1, 8, UINav.color, 2);
    draw_set_alpha(a0);
  },

  /** Debug overlay: numbered focusables and the target each direction would pick. */
  _drawDebug() {
    const items = UINav._collect();
    if (items.length === 0) return;

    const st = UIDraw.save();
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

    if (fi !== -1) {
      const fx = items[fi].cx;
      const fy = items[fi].cy;
      const consumesAxis = UINav._comp(UINav.focused, "navAxis") !== null;
      const dirs = [
        [0, -1, "U", c_red],
        [0, 1, "D", c_lime],
        [-1, 0, "L", c_aqua],
        [1, 0, "R", c_fuchsia],
      ];
      for (let d = 0; d < dirs.length; d++) {
        if (dirs[d][0] !== 0 && consumesAxis) continue; // horizontal adjusts, never moves
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

    UIDraw.restore(st);
  },

  _dirLine(x1, y1, x2, y2, col) {
    draw_line_width_color(x1, y1, x2, y2, 2, col, col);
  },

  /** Walk roots top-down, stopping at an exclusive (modal) root so nav can't reach behind it. */
  _collect() {
    const out = [];
    for (let i = UI.roots.length - 1; i >= 0; i--) {
      const r = UI.roots[i];
      if (!r.enabled) continue;
      UINav._walk(r, out);
      if (UINav._exclusive(r)) break;
    }
    return out;
  },

  _exclusive(el) {
    for (let i = 0; i < el.components.length; i++) {
      const c = el.components[i];
      if (typeof c.navExclusive === "function" && c.navExclusive()) return true;
    }
    return false;
  },

  _walk(el, out) {
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
  },

  _focusable(el) {
    const comps = el.components;
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      if (c.focusable === true) return true;
      if (typeof c.navActivate === "function") return true;
      if (typeof c.navAxis === "function") return true;
    }
    return false;
  },

  _comp(el, method) {
    for (let i = 0; i < el.components.length; i++) {
      if (typeof el.components[i][method] === "function") {
        return el.components[i];
      }
    }
    return null;
  },

  /**
   * A non-zero rect. Scrolled-out items stay focusable (focus scrolls them into view), else a list
   * taller than its viewport is unreachable by pad.
   */
  _visible(el) {
    const pos = el.getLayoutPosition();
    return pos.width > 0 && pos.height > 0;
  },

  _scrollIntoView(el) {
    let p = el.parent;
    while (p !== null) {
      const sc = p.getComponent(UIScroll);
      if (sc !== undefined) UINav._scrollOne(sc, p, el);
      p = p.parent;
    }
  },

  _scrollOne(sc, viewport, el) {
    const vp = viewport.getLayoutPosition(); // its own scroll is not applied to itself
    const fp = el.getLayoutPosition(); // already offset by the current scroll
    const margin = 8;
    let delta = 0;
    if (fp.top < vp.top + margin) {
      delta = fp.top - (vp.top + margin);
    } else if (fp.top + fp.height > vp.top + vp.height - margin) {
      delta = fp.top + fp.height - (vp.top + vp.height - margin);
    }
    if (delta === 0) return;
    const contentH = sc.content ? sc.content.getLayoutPosition().height : 0;
    const max = Math.max(0, contentH - vp.height);
    sc.scroll = clamp(sc.scroll + delta, 0, max);
    viewport.scrollY = sc.scroll; // apply now so the ring + next layout reflect it
  },

  _indexOf(items, el) {
    for (let i = 0; i < items.length; i++) if (items[i].el === el) return i;
    return -1;
  },

  _move(items, dx, dy) {
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
  },

  /**
   * Nearest focusable from `i` along (dx, dy), or -1. The cross-axis term is the gap between
   * rects, 0 when they overlap, so a full-width row moving Down picks the first item in visual
   * order rather than whatever sits nearest mid-screen.
   */
  _pick(items, i, dx, dy) {
    const s = items[i];
    let best = -1;
    let bestScore = Infinity;
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      const t = items[j];
      const primary = (t.cx - s.cx) * dx + (t.cy - s.cy) * dy;
      if (primary <= 0) continue;
      const perp =
        dy !== 0
          ? max(0, s.left - t.right, t.left - s.right)
          : max(0, s.top - t.bottom, t.top - s.bottom);
      const score = primary + perp * 2;
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    return best;
  },

  /** The frame's directional edge from keys, d-pad and stick, with its confirm and cancel. */
  _readInput() {
    let dx = 0;
    let dy = 0;
    let confirm = false;
    let cancel = false;

    if (Input.keyPressed(vk_left)) dx = -1;
    else if (Input.keyPressed(vk_right)) dx = 1;
    if (Input.keyPressed(vk_up)) dy = -1;
    else if (Input.keyPressed(vk_down)) dy = 1;
    if (Input.keyPressed(vk_enter) || Input.keyPressed(vk_space)) confirm = true;
    if (Input.keyPressed(vk_escape)) cancel = true;

    if (Input.padPressed(gp_padl)) dx = -1;
    else if (Input.padPressed(gp_padr)) dx = 1;
    if (Input.padPressed(gp_padu)) dy = -1;
    else if (Input.padPressed(gp_padd)) dy = 1;
    if (Input.padPressed(gp_face1)) confirm = true;
    if (Input.padPressed(gp_face2)) cancel = true;

    const e = { dx, dy, confirm, cancel };

    // hysteresis: re-arm under 0.4, fire over 0.6
    const ax = Input.padAxis(gp_axislh);
    const ay = Input.padAxis(gp_axislv);
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
    return e;
  },
};

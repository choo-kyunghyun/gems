/**
 * One frame's nav input. `dx`/`dy` are the move's direction, 0 on a confirm or a cancel.
 * @typedef {Object} UINavEvent
 * @property {"move"|"confirm"|"cancel"} kind
 * @property {number} dx
 * @property {number} dy
 */

/**
 * Keyboard/gamepad menu navigation over the focusable widgets of the enabled UI roots. The first
 * nav input only engages the focus ring; pointer movement disengages it. While live it claims the gamepad, so gameplay pad bindings read idle.
 *
 * A frame's input is one {UINavEvent}, offered to the focused element and then up its ancestors
 * until a component's `onNav(element, event)` returns true; only an unhandled event falls to the
 * nav's own focus move or ring release. The nav voices the input itself — a taken confirm
 * clicks, a focus move ticks — so a handler plays nothing. A component with `focusable: true`
 * makes its element a focus stop.
 *
 * A cancel reaches its owner from the focus even with the ring down. An untaken cancel drops the
 * ring and falls to the injected `back`, the app's back-out, which alone still hears a cancel
 * while the nav is suspended. What the UI or `back` acts on is spent, so a later reader sees only
 * the input they left.
 */
globalThis.UINav = {
  focused: null,
  engaged: false, // ring visible
  suspended: false, // gameplay keys don't drive the menu
  color: c_aqua,
  debugKey: vk_tab, // hold to show the traversal overlay (-1 disables)
  back: () => false, // () => bool: took the cancel the UI left

  _stickX: 0, // left-stick re-arm latches (0 = armed)
  _stickY: 0,

  // each event's keys and pad buttons: read into it, spent with it
  _src: {
    move: {
      keys: [vk_left, vk_right, vk_up, vk_down],
      pads: [gp_padl, gp_padr, gp_padu, gp_padd],
    },
    confirm: { keys: [vk_enter, vk_space], pads: [gp_face1] },
    cancel: { keys: [vk_escape], pads: [gp_face2] },
  },

  /** Moves the focus to `el`, revealing it in every viewport around it; the ring stays as it is. */
  focus(el) {
    UINav.focused = el;
    let p = el.parent;
    while (p !== null) {
      const sc = p.getComponent(UIScroll);
      if (sc !== undefined) sc.reveal(p, el);
      p = p.parent;
    }
  },

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
      const took = UINav._pressed(UINav._src.cancel) ? UINav.back() : false;
      if (took) UINav._spend({ kind: "cancel" });
      return;
    }

    if (UINav.focused !== null && !UINav._reachable(UINav.focused)) UINav.focused = null;

    if (Input.pointer.moved) UINav.engaged = false;

    const ev = UINav._event(UINav._readInput());
    if (ev === null) return;

    if (ev.kind === "cancel") {
      const taken = UINav.focused !== null ? UINav._dispatch(ev) : false;
      if (!taken) UINav.engaged = false;
      if (taken ? true : UINav.back()) UINav._spend(ev);
      return;
    }
    // walked only for an event that needs it, as an idle frame checks the focus alone
    const items = UINav._collect();
    if (items.length === 0) return;

    // the first nav input only engages, never also acts
    if (UINav.engaged ? UINav.focused === null : true) {
      UINav.engaged = true;
      if (UINav.focused === null) UINav.focus(items[0].el);
      UINav._spend(ev);
      return;
    }

    if (UINav._dispatch(ev)) {
      UINav._spend(ev);
      if (ev.kind === "confirm") Audio.play({ sound: UI.sounds.click });
      return;
    }
    if (ev.kind === "move") {
      const prevFocus = UINav.focused;
      UINav._move(items, ev.dx, ev.dy);
      if (UINav.focused !== prevFocus) {
        UINav._spend(ev);
        Audio.play({ sound: UI.sounds.tick });
      }
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
    let el = UINav.focused;
    while (el !== null) {
      if (el._destroyed) return true; // a handler tore its subtree down: nothing left to offer
      if (UINav._offer(el, ev)) return true;
      el = el.parent;
    }
    return false;
  },

  /** Offers `ev` to `el`'s own components in order; true once one took it. */
  _offer(el, ev) {
    const comps = el.components;
    for (let i = 0; i < comps.length; i++) {
      if (typeof comps[i].onNav === "function") {
        if (comps[i].onNav(el, ev) === true) return true;
      }
    }
    return false;
  },

  /** A taken event's keys are spent, so no later reader acts on the same press. */
  _spend(ev) {
    const src = UINav._src[ev.kind];
    for (let i = 0; i < src.keys.length; i++) Input.consumeKey(src.keys[i]);
    for (let i = 0; i < src.pads.length; i++) Input.consumePad(src.pads[i]);
  },

  /** Whether any of `src`'s keys or pad buttons has a pressed edge. */
  _pressed(src) {
    for (let i = 0; i < src.keys.length; i++) if (Input.keyPressed(src.keys[i])) return true;
    for (let i = 0; i < src.pads.length; i++) if (Input.padPressed(src.pads[i])) return true;
    return false;
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
      const dirs = [
        [0, -1, "U", c_red],
        [0, 1, "D", c_lime],
        [-1, 0, "L", c_aqua],
        [1, 0, "R", c_fuchsia],
      ];
      for (let d = 0; d < dirs.length; d++) {
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

  /** Walk the enabled roots top-down. */
  _collect() {
    const out = [];
    for (let i = UI.roots.length - 1; i >= 0; i--) {
      const r = UI.roots[i];
      if (r.enabled) UINav._walk(r, out);
    }
    return out;
  },

  /** Whether `_collect` would gather `el`, found up its own ancestors rather than by a walk. */
  _reachable(el) {
    if (el._destroyed) return false;
    if (!UINav._focusable(el) || !UINav._visible(el)) return false;
    let root = el;
    while (root.parent !== null) {
      if (!root.enabled) return false;
      root = root.parent;
    }
    if (!root.enabled) return false;
    return UI.roots.indexOf(root) !== -1;
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
    for (let i = 0; i < comps.length; i++) if (comps[i].focusable === true) return true;
    return false;
  },

  /**
   * A non-zero rect. Scrolled-out items stay focusable (focus scrolls them into view), else a list
   * taller than its viewport is unreachable by pad.
   */
  _visible(el) {
    const pos = el.getLayoutPosition();
    return pos.width > 0 && pos.height > 0;
  },

  _indexOf(items, el) {
    for (let i = 0; i < items.length; i++) if (items[i].el === el) return i;
    return -1;
  },

  _move(items, dx, dy) {
    const i = UINav._indexOf(items, UINav.focused);
    if (i === -1) {
      UINav.focus(items[0].el);
      return;
    }
    const best = UINav._pick(items, i, dx, dy);
    if (best !== -1) UINav.focus(items[best].el);
  },

  /**
   * Nearest focusable from `i` along (dx, dy), or -1. A candidate lies wholly past the edge
   * faced, so a row's end never jumps to a wider row beside it; only where the rects overlap does
   * the center decide. The cross-axis term is the gap between rects, 0 when they overlap, so a
   * full-width row moving Down picks the first item in visual order rather than whatever sits
   * nearest mid-screen.
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
      if (!UINav._past(s, t, dx, dy)) continue;
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

  /** Whether `t` clears `s`'s edge along (dx, dy), or overlaps `s` at all. */
  _past(s, t, dx, dy) {
    const e = 0.5; // fractional layout slack
    const apartX = t.right <= s.left + e ? true : t.left >= s.right - e;
    const apartY = t.bottom <= s.top + e ? true : t.top >= s.bottom - e;
    if (apartX ? false : !apartY) return true;
    if (dx > 0 ? t.left < s.right - e : false) return false;
    if (dx < 0 ? t.right > s.left + e : false) return false;
    if (dy > 0 ? t.top < s.bottom - e : false) return false;
    if (dy < 0 ? t.bottom > s.top + e : false) return false;
    return true;
  },

  /** The frame's directional edge from keys, d-pad and stick, with its confirm and cancel. */
  _readInput() {
    let dx = 0;
    let dy = 0;

    if (Input.keyPressed(vk_left)) dx = -1;
    else if (Input.keyPressed(vk_right)) dx = 1;
    if (Input.keyPressed(vk_up)) dy = -1;
    else if (Input.keyPressed(vk_down)) dy = 1;

    if (Input.padPressed(gp_padl)) dx = -1;
    else if (Input.padPressed(gp_padr)) dx = 1;
    if (Input.padPressed(gp_padu)) dy = -1;
    else if (Input.padPressed(gp_padd)) dy = 1;

    const e = {
      dx,
      dy,
      confirm: UINav._pressed(UINav._src.confirm),
      cancel: UINav._pressed(UINav._src.cancel),
    };

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

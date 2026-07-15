// single-line text field with caret+selection model, drag-select, key-repeat,
// clipboard, and horizontal scroll-to-caret. draws immediate-mode in onDraw.
// GMRT: modifier flags (shift/ctrl) read live via keyboard_check, never cached —
// a cached primitive bool can be clobbered mid-call.

const _INPUT_REPEAT_DELAY = 0.4; // s before a held nav/delete key starts repeating
const _INPUT_REPEAT_RATE = 0.04; // s between repeats once started
const _INPUT_BLINK = 0.53; // s per caret blink half-cycle
const _INPUT_DBLCLICK = 300; // ms window for double-click word-select

/** @implements {UIComponent} */
globalThis.UIInput = class UIInput {
  // UINav reads this to suspend menu nav while typing (arrows/Enter go to caret).
  /** @type {UIInput|null} */
  static active = null;

  constructor(input = {}) {
    this.value = input.value ?? "";
    this.placeholder = input.placeholder ?? "";
    this.maxLength = input.maxLength ?? Infinity;
    this.mask = input.mask ?? false; // renders as "*", never copies out
    this.filter = input.filter ?? null; // per-char RegExp or (char) => bool
    this.readOnly = input.readOnly ?? false;

    this.color = input.color ?? c_white;
    this.colorPlaceholder = input.colorPlaceholder ?? c_gray;
    this.colorCursor = input.colorCursor ?? c_white;
    this.colorSelection = input.colorSelection ?? Color.rgb(74, 158, 255);
    this.alphaSelection = input.alphaSelection ?? 0.35;
    this.font = input.font ?? -1;
    this.padX = input.padX ?? 6; // horizontal inset of the text from the field edge

    this.onConfirm = input.onConfirm ?? noop; // Enter
    this.onCancel = input.onCancel ?? noop; // Escape
    this.onChange = input.onChange ?? noop;

    this._focused = false;
    this._cursor = 0; // caret index [0, value.length]
    this._anchor = 0; // selection anchor; selection is [low, high] of the two
    this._scroll = 0; // px the text is shifted left so the caret stays visible
    this._dragging = false;
    this._blinkTimer = 0;
    this._cursorVis = true;

    this._repKey = -1; // key currently auto-repeating
    this._repTime = 0;
    this._lastClickTime = -Infinity;
    this._lastClickX = 0;
  }

  /** @returns {boolean} */
  get focused() {
    return this._focused;
  }

  /** Claim UIInput.active — mutes gameplay input + UINav. @returns {UIInput} */
  focus() {
    if (this._focused) return this;
    this._focused = true;
    UIInput.active = this;
    this._setCursor(this.value.length, false);
    keyboard_string = "";
    return this;
  }

  /** Release global keyboard capture. @returns {UIInput} */
  blur() {
    if (!this._focused) return this;
    this._focused = false;
    this._dragging = false;
    if (UIInput.active === this) UIInput.active = null;
    return this;
  }

  // UINav: confirm focuses the field; UINav suspends while active so caret keeps the keys.
  navActivate(element) {
    if (!this.readOnly) this.focus();
  }

  /** @param {*} value coerced to string @returns {UIInput} */
  setValue(value) {
    this.value = String(value).slice(0, this.maxLength);
    this._setCursor(this.value.length, false);
    this._scroll = 0;
    return this;
  }

  /** @returns {UIInput} */
  clear() {
    return this.setValue("");
  }

  // selection helpers

  _selLow() {
    return Math.min(this._anchor, this._cursor);
  }

  _selHigh() {
    return Math.max(this._anchor, this._cursor);
  }

  _hasSel() {
    return this._anchor !== this._cursor;
  }

  _setCursor(index, extend) {
    this._cursor = clamp(index, 0, this.value.length);
    if (!extend) this._anchor = this._cursor;
    this._blinkTimer = 0;
    this._cursorVis = true;
  }

  _isSpace(ch) {
    return ch === " " || ch === "\t";
  }

  _wordLeft(i) {
    while (i > 0 && this._isSpace(this.value[i - 1])) i--;
    while (i > 0 && !this._isSpace(this.value[i - 1])) i--;
    return i;
  }

  _wordRight(i) {
    const n = this.value.length;
    while (i < n && this._isSpace(this.value[i])) i++;
    while (i < n && !this._isSpace(this.value[i])) i++;
    return i;
  }

  _wordStart(i) {
    while (i > 0 && !this._isSpace(this.value[i - 1])) i--;
    return i;
  }

  _wordEnd(i) {
    const n = this.value.length;
    while (i < n && !this._isSpace(this.value[i])) i++;
    return i;
  }

  // edits

  _accept(ch) {
    if (ch.charCodeAt(0) < 32) return false; // reject control chars
    if (this.filter === null) return true;
    if (typeof this.filter === "function") return this.filter(ch);
    if (this.filter instanceof RegExp) return this.filter.test(ch);
    return true;
  }

  _deleteSelection() {
    const lo = this._selLow();
    const hi = this._selHigh();
    if (lo === hi) return false;
    this.value = this.value.slice(0, lo) + this.value.slice(hi);
    this._setCursor(lo, false);
    return true;
  }

  _insert(text) {
    if (this.readOnly) return;
    this._deleteSelection();
    let out = "";
    for (const ch of text) {
      if (this.value.length + out.length >= this.maxLength) break;
      if (this._accept(ch)) out += ch;
    }
    if (out === "") return;
    const at = this._cursor;
    this.value = this.value.slice(0, at) + out + this.value.slice(at);
    this._setCursor(at + out.length, false);
    this.onChange(this.value);
  }

  _copy() {
    if (!this._hasSel() || this.mask) return; // never copy masked text
    clipboard_set_text(this.value.slice(this._selLow(), this._selHigh()));
  }

  _cut() {
    if (this.readOnly) return;
    this._copy();
    if (this._deleteSelection()) this.onChange(this.value);
  }

  _paste() {
    if (this.readOnly) return;
    // skip clipboard_has_text() — it falsely reports false on GMRT 0.19; "" means empty.
    // no regex scrub: _insert/_accept drops control chars, and regex .replace() faults on GMRT.
    const text = clipboard_get_text();
    if (text === "" || text === undefined) return;
    this._insert(text);
  }

  // input

  // edge-then-interval repeat for one key at a time; true on press and each interval.
  _repeat(key) {
    if (keyboard_check_pressed(key)) {
      this._repKey = key;
      this._repTime = _INPUT_REPEAT_DELAY;
      return true;
    }
    if (this._repKey === key && keyboard_check(key)) {
      this._repTime -= Time.raw;
      if (this._repTime <= 0) {
        this._repTime = _INPUT_REPEAT_RATE;
        return true;
      }
    }
    return false;
  }

  _display() {
    return this.mask ? string_repeat("*", this.value.length) : this.value;
  }

  _textRegion(pos) {
    return {
      x: pos.left + this.padX,
      w: Math.max(1, pos.width - this.padX * 2),
      cy: pos.top + pos.height * 0.5,
    };
  }

  // nearest caret index to gui x; assumes field font is active draw font.
  _indexAtX(pos, mx) {
    const tr = this._textRegion(pos);
    const disp = this._display();
    const local = mx - tr.x + this._scroll;
    if (local <= 0) return 0;
    let best = 0;
    let bestD = Math.abs(local);
    let i = 1;
    while (i <= disp.length) {
      const d = Math.abs(local - string_width(disp.slice(0, i)));
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
      i++;
    }
    return best;
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const over = !block && element.positionMeeting(mx, my);

    // set field font so string_width calls below match render width; resolve an I18n key
    // here too — the measure font must match the draw font after a locale reload.
    const prevFont = draw_get_font();
    const fnt = resolveUIFont(this.font);
    if (fnt !== -1) draw_set_font(fnt);

    if (UIPointer.pressed) {
      if (over) {
        this.focus();
        const i = this._indexAtX(pos, mx);
        const dbl =
          current_time - this._lastClickTime < _INPUT_DBLCLICK &&
          Math.abs(mx - this._lastClickX) < 4;
        if (dbl) {
          this._anchor = this._wordStart(i);
          this._setCursor(this._wordEnd(i), true);
        } else {
          this._setCursor(i, keyboard_check(vk_shift));
          this._dragging = true;
        }
        this._lastClickTime = current_time;
        this._lastClickX = mx;
      } else {
        this.blur();
      }
    }

    if (this._dragging) {
      if (UIPointer.down) this._setCursor(this._indexAtX(pos, mx), true);
      else this._dragging = false;
    }

    if (this._focused) {
      this._processKeyboard();
      this._blinkTimer += Time.raw;
      if (this._blinkTimer >= _INPUT_BLINK) {
        this._blinkTimer -= _INPUT_BLINK;
        this._cursorVis = !this._cursorVis;
      }
    }

    draw_set_font(prevFont);
    return this._dragging || over || block;
  }

  _processKeyboard() {
    const len = this.value.length;
    const ctrl = keyboard_check(vk_control);

    // clipboard + select-all: swallow keyboard_string so the key doesn't also type.
    if (ctrl) {
      if (keyboard_check_pressed(ord("A"))) {
        this._anchor = 0;
        this._setCursor(len, true);
        keyboard_string = "";
        return;
      }
      if (keyboard_check_pressed(ord("C"))) {
        this._copy();
        keyboard_string = "";
        return;
      }
      if (keyboard_check_pressed(ord("X"))) {
        this._cut();
        keyboard_string = "";
        return;
      }
      if (keyboard_check_pressed(ord("V"))) {
        this._paste();
        keyboard_string = "";
        return;
      }
    }

    // caret navigation (ctrl = word jump, shift = extend selection).
    if (this._repeat(vk_left)) {
      if (keyboard_check(vk_shift))
        this._setCursor(
          ctrl ? this._wordLeft(this._cursor) : this._cursor - 1,
          true,
        );
      else if (this._hasSel()) this._setCursor(this._selLow(), false);
      else
        this._setCursor(
          ctrl ? this._wordLeft(this._cursor) : this._cursor - 1,
          false,
        );
      keyboard_string = "";
      return;
    }
    if (this._repeat(vk_right)) {
      if (keyboard_check(vk_shift))
        this._setCursor(
          ctrl ? this._wordRight(this._cursor) : this._cursor + 1,
          true,
        );
      else if (this._hasSel()) this._setCursor(this._selHigh(), false);
      else
        this._setCursor(
          ctrl ? this._wordRight(this._cursor) : this._cursor + 1,
          false,
        );
      keyboard_string = "";
      return;
    }
    if (this._repeat(vk_home)) {
      this._setCursor(0, keyboard_check(vk_shift));
      keyboard_string = "";
      return;
    }
    if (this._repeat(vk_end)) {
      this._setCursor(len, keyboard_check(vk_shift));
      keyboard_string = "";
      return;
    }

    // deletion: selection first, else one char / one word (ctrl).
    if (!this.readOnly && this._repeat(vk_backspace)) {
      if (this._deleteSelection()) this.onChange(this.value);
      else if (this._cursor > 0) {
        const to = ctrl ? this._wordLeft(this._cursor) : this._cursor - 1;
        this.value = this.value.slice(0, to) + this.value.slice(this._cursor);
        this._setCursor(to, false);
        this.onChange(this.value);
      }
      keyboard_string = "";
      return;
    }
    if (!this.readOnly && this._repeat(vk_delete)) {
      if (this._deleteSelection()) this.onChange(this.value);
      else if (this._cursor < len) {
        const to = ctrl ? this._wordRight(this._cursor) : this._cursor + 1;
        this.value = this.value.slice(0, this._cursor) + this.value.slice(to);
        this._setCursor(this._cursor, false);
        this.onChange(this.value);
      }
      keyboard_string = "";
      return;
    }

    if (keyboard_check_pressed(vk_enter)) {
      this.onConfirm(this.value);
      this.blur();
      keyboard_string = "";
      return;
    }
    if (keyboard_check_pressed(vk_escape)) {
      this.onCancel(this.value);
      this.blur();
      keyboard_string = "";
      return;
    }

    // plain text entry (not while ctrl is held — those are shortcuts).
    if (ctrl) {
      keyboard_string = "";
      return;
    }
    const typed = keyboard_string;
    keyboard_string = "";
    if (typed !== "") this._insert(typed);
  }

  // draw

  // shift _scroll so caret stays visible.
  _clampScroll(tr, disp) {
    const caret = string_width(disp.slice(0, this._cursor));
    if (caret - this._scroll < 0) this._scroll = caret;
    else if (caret - this._scroll > tr.w) this._scroll = caret - tr.w;
    const maxScroll = Math.max(0, string_width(disp) - tr.w);
    this._scroll = clamp(this._scroll, 0, maxScroll);
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    const tr = this._textRegion(pos);

    const st = uiDrawSave();

    const fnt = resolveUIFont(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_halign(fa_left);
    draw_set_valign(fa_middle);
    draw_set_alpha(1);

    const disp = this._display();

    if (disp === "" && !this._focused) {
      draw_set_color(this.colorPlaceholder);
      draw_text(tr.x, tr.cy, this.placeholder);
    } else {
      this._clampScroll(tr, disp);
      const halfH = string_height("|") * 0.5;
      const winL = this._scroll; // left edge of the visible window, text-pixel space

      // clip by substring/offset rather than gpu_set_scissor — scissor leaked onto all
      // later UI draws on GMRT 0.19 (whole scene invisible). no global render state touched.
      let start = 0;
      while (start < disp.length && string_width(disp.slice(0, start)) < winL)
        start++;
      let end = start;
      while (
        end < disp.length &&
        string_width(disp.slice(0, end + 1)) - winL <= tr.w
      )
        end++;
      const startX = tr.x + string_width(disp.slice(0, start)) - winL;

      // selection band, clamped to field width.
      if (this._focused && this._hasSel()) {
        const sx = clamp(
          string_width(disp.slice(0, this._selLow())) - winL,
          0,
          tr.w,
        );
        const ex = clamp(
          string_width(disp.slice(0, this._selHigh())) - winL,
          0,
          tr.w,
        );
        if (ex > sx) {
          draw_set_color(this.colorSelection);
          draw_set_alpha(this.alphaSelection);
          draw_rectangle(
            tr.x + sx,
            tr.cy - halfH,
            tr.x + ex,
            tr.cy + halfH,
            false,
          );
          draw_set_alpha(1);
        }
      }

      draw_set_color(this.color);
      draw_text(startX, tr.cy, disp.slice(start, end));

      // caret, only when inside the visible region.
      if (this._focused && this._cursorVis) {
        const cx = string_width(disp.slice(0, this._cursor)) - winL;
        if (cx >= 0 && cx <= tr.w) {
          draw_set_color(this.colorCursor);
          draw_rectangle(
            tr.x + cx,
            tr.cy - halfH,
            tr.x + cx + 2,
            tr.cy + halfH,
            false,
          );
        }
      }
    }

    uiDrawRestore(st);
  }

  /** @param {UIElement} element */
  onDestroy(element) {
    if (this._focused) {
      this._focused = false;
      keyboard_string = "";
    }
    // must clear UIInput.active on destroy — a focused field torn down mid-typing
    // (scene change / portal) would strand the capture and keep gameplay + UINav muted forever.
    if (UIInput.active === this) UIInput.active = null;
  }
};

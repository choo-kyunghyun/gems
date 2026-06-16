/**
 * VirtualKeyboard — on-screen keyboard for gamepad (or mouse) text entry into a
 * UIInput. Standalone static singleton (not a UIComponent).
 *
 * `VirtualKeyboard.open(input)` pops a modal (gemsModal → exclusive backdrop, blocks
 * background nav, closes on Esc / backdrop) whose body is a preview line + a grid of
 * character keys. The keys are ordinary `gemsButton`s, so the whole keyboard is
 * keyboard/gamepad-navigable through UINav for free (move with the dpad/stick, press
 * A/Enter to type). Keys edit an in-memory buffer; **Done** commits it to the input
 * (`setValue` + `onConfirm`), **Cancel** / Esc / backdrop discard it — so the field
 * behind is untouched until Done.
 *
 * GMRT: key labels are live textRefs that read the shift state (no relabeling), the
 * buffer is plain string ops, and there are no cached primitive bools. Opens at most
 * one keyboard at a time.
 */
globalThis.VirtualKeyboard = class VirtualKeyboard {
  /** @type {UIModal|null} */
  static _modal = null;
  /** @type {UIInput|null} */
  static _input = null;
  static _buffer = "";
  static _shift = false;

  // A METHOD, not a `static get`: on GMRT 0.20 a static getter with a comparison body
  // (`_input !== null`) miscompiles to a constant (verified on SystemMenu.isOpen — the
  // getter read false while the field held a live object). See CLAUDE.md.
  /** @returns {boolean} whether the on-screen keyboard is open */
  static isOpen() {
    return VirtualKeyboard._input !== null;
  }

  /** Open the keyboard editing `input`'s text (no-op if already open or input is null). @param {UIInput} input */
  static open(input) {
    if (VirtualKeyboard.isOpen() || input == null) return;
    VirtualKeyboard._input = input;
    VirtualKeyboard._buffer = input.value;
    VirtualKeyboard._shift = false;

    VirtualKeyboard._modal = gemsModal({
      title: I18n.text("VK_TITLE"),
      body: VirtualKeyboard._buildBody(),
      width: 580,
      buttons: [
        { label: I18n.text("VK_CANCEL") },
        {
          label: I18n.text("VK_DONE"),
          primary: true,
          onClick: () => VirtualKeyboard._commit(),
        },
      ],
      onClose: () => VirtualKeyboard._reset(), // Done/Cancel/Esc/backdrop all land here
    });
  }

  /** Append a character to the buffer (respecting the input's maxLength). @param {string} ch */
  static type(ch) {
    if (!VirtualKeyboard.isOpen()) return;
    const max = VirtualKeyboard._input.maxLength ?? Infinity;
    if (VirtualKeyboard._buffer.length >= max) return;
    VirtualKeyboard._buffer += ch;
  }

  /** Delete the last buffered character. */
  static backspace() {
    const b = VirtualKeyboard._buffer;
    if (b.length > 0) VirtualKeyboard._buffer = b.substring(0, b.length - 1);
  }

  /** Flip shift (letter case) for subsequent keys. */
  static toggleShift() {
    VirtualKeyboard._shift = !VirtualKeyboard._shift;
  }

  // Done → push the buffer into the field and fire its confirm hook.
  static _commit() {
    const inp = VirtualKeyboard._input;
    if (inp === null) return;
    inp.setValue(VirtualKeyboard._buffer);
    inp.onConfirm(inp.value);
  }

  // Called from the modal's onClose (covers Done, Cancel, Esc and backdrop) — never
  // closes the modal itself, so there's no re-entrancy.
  static _reset() {
    VirtualKeyboard._modal = null;
    VirtualKeyboard._input = null;
    VirtualKeyboard._buffer = "";
    VirtualKeyboard._shift = false;
  }

  // The buffer as shown in the preview (masked for password fields, placeholder when
  // empty).
  static _displayText() {
    const b = VirtualKeyboard._buffer;
    if (b === "") return I18n.text("VK_EMPTY");
    if (VirtualKeyboard._input !== null && VirtualKeyboard._input.mask) {
      let s = "";
      for (let i = 0; i < b.length; i++) s += "*";
      return s;
    }
    return b;
  }

  // ── body layout ────────────────────────────────────────────────
  static _buildBody() {
    const body = gemsList({ gap: GemsTheme.gapSm });

    // Preview line: the buffer on a sunken panel.
    const preview = new UIElement({
      height: 40,
      justifyContent: "center",
      paddingHorizontal: GemsTheme.pad,
    });
    preview.addComponent(
      new UIPanel({
        color: gemsColor(GemsTheme.btnPress),
        rad: GemsTheme.radiusSm,
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
      }),
    );
    preview.insertChild(
      gemsLabel(() => VirtualKeyboard._displayText(), {
        halign: fa_center,
        color: GemsTheme.text,
      }),
    );
    body.insertChild(preview);

    body.insertChild(VirtualKeyboard._charRow("1234567890"));
    body.insertChild(VirtualKeyboard._charRow("qwertyuiop"));
    body.insertChild(VirtualKeyboard._charRow("asdfghjkl"));
    body.insertChild(VirtualKeyboard._charRow("zxcvbnm"));

    // Special row: Shift / Space / Backspace.
    const special = new UIElement({
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
    });
    special.insertChild(
      gemsButton(
        () => I18n.text("VK_SHIFT") + (VirtualKeyboard._shift ? " *" : ""),
        () => VirtualKeyboard.toggleShift(),
        { width: 120, height: 46 },
      ),
    );
    special.insertChild(
      gemsButton(I18n.textRef("VK_SPACE"), () => VirtualKeyboard.type(" "), {
        width: 230,
        height: 46,
      }),
    );
    special.insertChild(
      gemsButton(I18n.textRef("VK_BACK"), () => VirtualKeyboard.backspace(), {
        width: 120,
        height: 46,
      }),
    );
    body.insertChild(special);

    return body;
  }

  static _charRow(chars) {
    const row = new UIElement({
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
    });
    for (let i = 0; i < chars.length; i++) {
      row.insertChild(VirtualKeyboard._key(chars.charAt(i)));
    }
    return row;
  }

  // a-z → A-Z. NOT String.toUpperCase() — on GMRT (still broken on 0.20) that returns garbage
  // Unicode (probe: "q".toUpperCase() === "ଊ"), so shifted letters would type as unrenderable
  // glyphs. Shift the char code by 32 instead (fromCharCode/charCodeAt are fine).
  static _upper(ch) {
    if (ch < "a" || ch > "z") return ch;
    return String.fromCharCode(ch.charCodeAt(0) - 32);
  }

  // A single character key. Letters honour Shift (live label + typed value); digits
  // are unaffected.
  static _key(ch) {
    const isLetter = ch >= "a" && ch <= "z";
    return gemsButton(
      isLetter
        ? () => (VirtualKeyboard._shift ? VirtualKeyboard._upper(ch) : ch)
        : ch,
      () =>
        VirtualKeyboard.type(
          isLetter && VirtualKeyboard._shift ? VirtualKeyboard._upper(ch) : ch,
        ),
      { width: 46, height: 46, font: I18n.font("header") },
    );
  }
};

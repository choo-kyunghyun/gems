// on-screen keyboard for gamepad/mouse text entry into a UIInput. standalone static singleton.
// keys are gemsButtons, so the whole grid is UINav-navigable for free. edits an in-memory buffer:
// Done commits (setValue + onConfirm), Cancel/Esc/backdrop discard — the field is untouched until Done.
globalThis.VirtualKeyboard = class VirtualKeyboard {
  /** @type {UIModal|null} */
  static _modal = null;
  /** @type {UIInput|null} */
  static _input = null;
  static _buffer = "";
  static _shift = false;

  // METHOD not `static get` — comparison-body static getters miscompile on GMRT 0.20 (see CLAUDE.md).
  /** @returns {boolean} */
  static isOpen() {
    return VirtualKeyboard._input !== null;
  }

  /** no-op if already open or input is null. @param {UIInput} input */
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

  /** append a char, respecting the input's maxLength. @param {string} ch */
  static type(ch) {
    if (!VirtualKeyboard.isOpen()) return;
    const max = VirtualKeyboard._input.maxLength ?? Infinity;
    if (VirtualKeyboard._buffer.length >= max) return;
    VirtualKeyboard._buffer += ch;
  }

  static backspace() {
    const b = VirtualKeyboard._buffer;
    if (b.length > 0) VirtualKeyboard._buffer = b.substring(0, b.length - 1);
  }

  static toggleShift() {
    VirtualKeyboard._shift = !VirtualKeyboard._shift;
  }

  // push buffer into the field + fire its confirm hook
  static _commit() {
    const inp = VirtualKeyboard._input;
    if (inp === null) return;
    inp.setValue(VirtualKeyboard._buffer);
    inp.onConfirm(inp.value);
  }

  // from the modal's onClose (Done/Cancel/Esc/backdrop) — never closes the modal itself (no re-entrancy)
  static _reset() {
    VirtualKeyboard._modal = null;
    VirtualKeyboard._input = null;
    VirtualKeyboard._buffer = "";
    VirtualKeyboard._shift = false;
  }

  // preview text: masked for password fields, placeholder when empty
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

  // body layout
  static _buildBody() {
    const body = gemsList({ gap: GemsTheme.gapSm });

    // preview line: buffer on a sunken panel
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

    // special row: Shift / Space / Backspace
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

  // a-z → A-Z by char code. NOT toUpperCase() — returns garbage Unicode on GMRT (see CLAUDE.md).
  static _upper(ch) {
    if (ch < "a" || ch > "z") return ch;
    return String.fromCharCode(ch.charCodeAt(0) - 32);
  }

  // single char key; letters honor Shift (live label + typed value), digits don't
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
      { width: 46, height: 46, font: "header" },
    );
  }
};

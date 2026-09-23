// On-screen keyboard for gamepad/mouse text entry into a UIInput. It edits an in-memory buffer:
// Done commits, every other close discards.
globalThis.VirtualKeyboard = {
  _modal: null,
  _input: null,
  _buffer: "",
  _shift: false,

  isOpen() {
    return VirtualKeyboard._input !== null;
  },

  open(input) {
    if (VirtualKeyboard.isOpen() || input == null) return;
    VirtualKeyboard._input = input;
    VirtualKeyboard._buffer = input.value;
    VirtualKeyboard._shift = false;

    VirtualKeyboard._modal = facetModal({
      title: I18n.text("VK_TITLE"),
      body: VirtualKeyboard._buildBody(),
      width: 580,
      buttons: [
        { label: I18n.text("COMMON_CANCEL") },
        {
          label: I18n.text("VK_DONE"),
          primary: true,
          onClick: () => VirtualKeyboard._commit(),
        },
      ],
      onClose: () => VirtualKeyboard._reset(), // every close lands here
    });
  },

  type(ch) {
    if (!VirtualKeyboard.isOpen()) return;
    const max = VirtualKeyboard._input.maxLength ?? Infinity;
    if (VirtualKeyboard._buffer.length >= max) return;
    VirtualKeyboard._buffer += ch;
  },

  backspace() {
    const b = VirtualKeyboard._buffer;
    if (b.length > 0) VirtualKeyboard._buffer = b.substring(0, b.length - 1);
  },

  toggleShift() {
    VirtualKeyboard._shift = !VirtualKeyboard._shift;
  },

  _commit() {
    const inp = VirtualKeyboard._input;
    if (inp === null) return;
    inp.setValue(VirtualKeyboard._buffer);
    inp.onConfirm(inp.value);
  },

  /** Drop an open keyboard with its modal, discarding the buffer. */
  reset() {
    if (VirtualKeyboard._modal !== null) VirtualKeyboard._modal.remove();
    VirtualKeyboard._reset();
  },

  /** The modal's onClose — never closes the modal itself (no re-entrancy). */
  _reset() {
    VirtualKeyboard._modal = null;
    VirtualKeyboard._input = null;
    VirtualKeyboard._buffer = "";
    VirtualKeyboard._shift = false;
  },

  _displayText() {
    const b = VirtualKeyboard._buffer;
    if (b === "") return I18n.text("VK_EMPTY");
    if (VirtualKeyboard._input !== null && VirtualKeyboard._input.mask) {
      let s = "";
      for (let i = 0; i < b.length; i++) s += "*";
      return s;
    }
    return b;
  },

  _buildBody() {
    const body = facetList({ gap: FacetTheme.gapSm });

    const preview = new UIElement({
      height: 40,
      justifyContent: "center",
      paddingHorizontal: FacetTheme.pad,
    });
    preview.addComponent(
      new UIPanel({
        color: facetColor(FacetTheme.btnPress),
        rad: FacetTheme.radiusSm,
        border: 1,
        borderColor: facetColor(FacetTheme.border),
      }),
    );
    preview.insertChild(
      facetLabel(() => VirtualKeyboard._displayText(), {
        halign: fa_center,
        color: FacetTheme.text,
      }),
    );
    body.insertChild(preview);

    body.insertChild(VirtualKeyboard._charRow("1234567890"));
    body.insertChild(VirtualKeyboard._charRow("qwertyuiop"));
    body.insertChild(VirtualKeyboard._charRow("asdfghjkl"));
    body.insertChild(VirtualKeyboard._charRow("zxcvbnm"));

    const special = new UIElement({
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
    });
    special.insertChild(
      facetButton(
        () => I18n.text("VK_SHIFT") + (VirtualKeyboard._shift ? " *" : ""),
        () => VirtualKeyboard.toggleShift(),
        { width: 120, height: 46 },
      ),
    );
    special.insertChild(
      facetButton(I18n.textRef("VK_SPACE"), () => VirtualKeyboard.type(" "), {
        width: 230,
        height: 46,
      }),
    );
    special.insertChild(
      facetButton(I18n.textRef("VK_BACK"), () => VirtualKeyboard.backspace(), {
        width: 120,
        height: 46,
      }),
    );
    body.insertChild(special);

    return body;
  },

  _charRow(chars) {
    const row = new UIElement({
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
    });
    for (let i = 0; i < chars.length; i++) {
      row.insertChild(VirtualKeyboard._key(chars.charAt(i)));
    }
    return row;
  },

  /** BUG: a-z → A-Z by char code, not toUpperCase() (docs/GMRT.md #15563). */
  _upper(ch) {
    if (ch < "a" || ch > "z") return ch;
    return String.fromCharCode(ch.charCodeAt(0) - 32);
  },

  /** Letters honor Shift in both label and typed value; digits don't. */
  _key(ch) {
    const isLetter = ch >= "a" && ch <= "z";
    return facetButton(
      isLetter
        ? () => (VirtualKeyboard._shift ? VirtualKeyboard._upper(ch) : ch)
        : ch,
      () =>
        VirtualKeyboard.type(
          isLetter && VirtualKeyboard._shift ? VirtualKeyboard._upper(ch) : ch,
        ),
      { width: 46, height: 46, font: "header" },
    );
  },
};

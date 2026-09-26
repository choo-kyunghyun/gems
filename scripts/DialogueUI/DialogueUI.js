/**
 * The dialogue card: the scene's `dialogue` record typed out in a card docked at the bottom of
 * `scene.ui`. open() is its one door: the card shows and takes the focus until the record closes,
 * then hands the focus back. A focused card takes a confirm or a click as an advance and keeps the
 * moves, so the focus stays on it; a cancel is left to the app. A page is wrapped whole before it
 * reveals, so the typing never reflows a line.
 */
const DIALOGUE_LINES = 3; // fixed box height in rows; pages are written to fit
const DIALOGUE_W = 760;

globalThis.DialogueUI = {
  /** Once per scene; returns the view the other members take. */
  build(scene) {
    const view = {
      d: scene.dialogue,
      el: null,
      card: null,
      body: null,
      prev: null, // the focus the card took, handed back on close
      text: "",
      w: -1,
      lines: [],
      starts: [],
    };
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 24,
      alignItems: "center",
    });
    // opaque, as it may sit over other UI
    const card = facetCard({
      width: DIALOGUE_W,
      padding: FacetTheme.pad,
      gap: FacetTheme.gapSm,
      alpha: 1,
    });
    const chevron = facetColor(FacetTheme.accentHi);
    const trigger = new UITrigger({ onClick: () => DialogueUI._advance(view) });
    card.addComponent({
      focusable: true,
      onUpdate: (el, block) => DialogueUI._update(view, el, block, trigger),
      onNav: (el, ev) => DialogueUI._nav(view, ev),
      onDraw: (el) => DialogueUI._chevron(view.d, el, chevron),
    });
    const name = new UIElement({ width: "100%", height: 26 });
    name.insertChild(
      facetLabel(() => Dialogue.speaker(view.d), { color: FacetTheme.accentHi, font: "header" }),
    );
    const body = new UIElement({ width: "100%", height: DIALOGUE_LINES * string_height("Mg") });
    body.insertChild(
      facetLabel(() => DialogueUI._visible(view, view.d), { color: FacetTheme.text }),
    );
    card.insertChild(name);
    card.insertChild(body);
    wrap.insertChild(card);
    wrap.enabled = false;
    scene.ui.insertChild(wrap);
    view.el = wrap;
    view.card = card;
    view.body = body;
    return view;
  },

  /** Starts `pages` on the record and shows the card; `pages` and `opts` as Dialogue.start. */
  open(view, pages, opts = {}) {
    Dialogue.start(view.d, pages, opts);
    if (!Dialogue.isOpen(view.d)) return;
    if (!view.el.enabled) view.prev = UINav.focused;
    view.el.enabled = true;
    UINav.focus(view.card);
  },

  _hide(view) {
    if (!view.el.enabled) return;
    view.el.enabled = false;
    if (UINav.focused === view.card) {
      if (view.prev !== null) UINav.focus(view.prev);
      else UINav.focused = null;
    }
    view.prev = null;
  },

  /**
   * A record closed from outside takes the card down with it; a focus dropped while the card was
   * stood in for comes back to it.
   */
  _update(view, el, block, trigger) {
    if (!Dialogue.isOpen(view.d)) {
      DialogueUI._hide(view);
      return block;
    }
    if (UINav.focused === null) UINav.focus(el);
    Dialogue.tick(view.d, Time.raw);
    return trigger.onUpdate(el, block);
  },

  _advance(view) {
    Dialogue.advance(view.d);
    if (!Dialogue.isOpen(view.d)) DialogueUI._hide(view);
  },

  _nav(view, ev) {
    if (ev.kind === "cancel") return false;
    if (ev.kind === "confirm") DialogueUI._advance(view);
    return true;
  },

  _chevron(d, el, color) {
    if (!Dialogue.done(d)) return;
    if (floor(current_time / 450) % 2 !== 0) return;
    const pos = el.getLayoutPosition();
    const ah = 5;
    UIDraw.arrow(
      pos.left + pos.width - FacetTheme.pad - ah,
      pos.top + pos.height - FacetTheme.pad * 0.5 - ah,
      "down",
      ah,
      color,
    );
  },

  /** The page's revealed characters over its wrapped lines. */
  _visible(view, d) {
    if (!Dialogue.isOpen(d)) return "";
    const text = Dialogue.text(d);
    const w = view.body.getLayoutPosition().width;
    if (!(w > 0)) return "";
    if (text !== view.text || w !== view.w) DialogueUI._wrap(view, text, w);
    const n = Dialogue.shown(d);
    let s = "";
    for (let i = 0; i < view.lines.length; i++) {
      if (i > 0) s += "\n";
      s += view.lines[i].substring(0, clamp(n - view.starts[i], 0, view.lines[i].length));
    }
    return s;
  },

  /** Each line is a slice of `text` at its offset, broken at a space or a newline. */
  _wrap(view, text, maxW) {
    const lines = [];
    const starts = [];
    const paras = text.split("\n");
    let at = 0;
    for (let p = 0; p < paras.length; p++) {
      const words = paras[p].split(" ");
      let cur = "";
      let start = at;
      let pos = at;
      for (let i = 0; i < words.length; i++) {
        const probe = cur === "" ? words[i] : cur + " " + words[i];
        if (cur !== "" && string_width(probe) > maxW) {
          lines.push(cur);
          starts.push(start);
          cur = words[i];
          start = pos;
        } else {
          cur = probe;
        }
        pos += words[i].length + 1;
      }
      lines.push(cur);
      starts.push(start);
      at += paras[p].length + 1;
    }
    view.lines = lines;
    view.starts = starts;
    view.text = text;
    view.w = maxW;
  },
};

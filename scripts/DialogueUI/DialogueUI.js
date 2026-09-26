/**
 * The dialogue card: the scene's `dialogue` record typed out in a card docked at the bottom of
 * `scene.ui`. While it shows, an advance — Enter, Space, the pad's face button, or a click inside
 * the card — goes to the record, and the card then claims the keyboard and the pad for the frame.
 * A page is wrapped whole before it reveals, so the typing never reflows a line.
 */
const DIALOGUE_LINES = 3; // fixed box height in rows; pages are written to fit
const DIALOGUE_W = 760;

globalThis.DialogueUI = {
  /** Once per scene; returns the view update() takes. */
  build(scene) {
    const d = scene.dialogue;
    const view = { el: null, body: null, text: "", w: -1, lines: [], starts: [] };
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
    card.addComponent({
      onUpdate: (el, block) => DialogueUI._input(d, el, block),
      onDraw: (el) => DialogueUI._chevron(d, el, chevron),
    });
    const name = new UIElement({ width: "100%", height: 26 });
    name.insertChild(
      facetLabel(() => Dialogue.speaker(d), { color: FacetTheme.accentHi, font: "header" }),
    );
    const body = new UIElement({ width: "100%", height: DIALOGUE_LINES * string_height("Mg") });
    body.insertChild(facetLabel(() => DialogueUI._visible(view, d), { color: FacetTheme.text }));
    card.insertChild(name);
    card.insertChild(body);
    wrap.insertChild(card);
    wrap.enabled = false;
    scene.ui.insertChild(wrap);
    view.el = wrap;
    view.body = body;
    return view;
  },

  /** Once per frame: the card shows while the record is open. */
  update(scene, view) {
    view.el.enabled = Dialogue.isOpen(scene.dialogue);
  },

  _input(d, el, block) {
    Dialogue.tick(d, Time.raw);
    const mx = Input.pointer.x;
    const my = Input.pointer.y;
    let advance = false;
    if (Input.keyPressed(vk_enter)) advance = true;
    if (Input.keyPressed(vk_space)) advance = true;
    if (Input.padPressed(gp_face1)) advance = true;
    // only a click inside the card advances, so one on the UI around it never pages
    if (!block ? Input.pointer.left.pressed : false) {
      if (el.positionMeeting(mx, my)) advance = true;
    }
    if (advance) Dialogue.advance(d);
    Input.claimKeys();
    Input.claimPad();
    return block ? true : el.positionMeeting(mx, my);
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

/**
 * The gameplay window shell — one page at a time in the scene root's body, standing in for the
 * HUD, which hides while a page is open.
 *
 * A page is a plain object built once per scene and added under an id:
 *   el            UIElement — the content column, stacked absolute in the card, so a switch is an
 *                 `enabled` flip and a page keeps its sort/filter/selection
 *   title         I18n textRef or () => string, read live
 *   refresh()     rebuild the live data — runs on open and whenever `dirty` is set
 *   onOpen(opts)  optional — the per-open parameters
 *   onClose()     optional
 *   titleExtra    optional UIElement mounted in the title row while the page shows
 * A page's own state lives on the page object, never on the scene; the shell's three fields are
 * the whole window state:
 *   page    the open page, else null              target  the entity the page stands over, else -1
 *   dirty   the open page refreshes next update()
 * Opening over an open page replaces it. Refreshing whatever page shows is idempotent, so a writer
 * sets `dirty` without asking which. update() runs outside the UI traversal, so a refresh never
 * destroys the widget whose click requested it.
 */
globalThis.Window = class Window {
  /** `root` is a facetRoot; the window fills what its body leaves. */
  constructor(root) {
    this.page = null;
    this.target = -1;
    this.dirty = false;
    this._pages = {}; // id -> page
    this._host = facetCard({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      padding: FacetTheme.pad,
      gap: FacetTheme.gapSm,
    });
    this._host.addComponent(new UITrigger({})); // a click on the page never reaches the world
    // the title cell grows so a page's extra items and the close button sit right
    this._titleRow = new UIElement({
      width: "100%",
      height: 40,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    const titleCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    titleCell.insertChild(
      facetLabel(() => this._title(), { font: "header", color: FacetTheme.text }),
    );
    this._titleRow.insertChild(titleCell);
    this._titleRow.insertChild(
      facetButton("x", () => this.close(), {
        width: 32,
        height: 32,
        rad: FacetTheme.radiusSm,
      }),
    );
    this._host.insertChild(this._titleRow);
    this._host.insertChild(facetDivider());
    this._stack = new UIElement({ width: "100%", flexGrow: 1, flexBasis: 0 });
    this._host.insertChild(this._stack);
    this._host.enabled = false;
    root.body.insertChild(this._host);
  }

  /** Stamps `id` and `_slot` on the page; returns it. */
  add(id, page) {
    page.id = id;
    const slot = new UIElement({
      positionType: "absolute",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });
    slot.insertChild(page.el);
    slot.enabled = false;
    this._stack.insertChild(slot);
    page._slot = slot;
    this._pages[id] = page;
    return page;
  }

  isOpen() {
    return this.page !== null;
  }

  is(id) {
    return this.page !== null ? this.page.id === id : false;
  }

  /** Show the page over `opts.target` (-1 = none), replacing any open page. */
  open(id, opts = {}) {
    const page = this._pages[id];
    if (page === undefined) {
      Log.error(`Window.open: no page "${id}"`);
      return;
    }
    if (this.page !== null) this.close();
    this.page = page;
    this.target = opts.target ?? -1;
    page._slot.enabled = true;
    if (page.titleExtra !== undefined) {
      const row = this._titleRow;
      row.insertChild(page.titleExtra, row.children.length - 1); // before the close "x"
    }
    this._host.enabled = true;
    if (page.onOpen !== undefined) page.onOpen(opts);
    this.dirty = true;
  }

  /** A no-op with nothing open. */
  close() {
    const page = this.page;
    if (page === null) return;
    this.page = null;
    this.target = -1;
    this.dirty = false;
    page._slot.enabled = false;
    if (page.titleExtra !== undefined) this._titleRow.removeChild(page.titleExtra);
    this._host.enabled = false;
    if (page.onClose !== undefined) page.onClose();
  }

  /** The Esc step: closes the page; false when nothing was open. */
  back() {
    if (this.page === null) return false;
    this.close();
    return true;
  }

  /** Once per frame, after the scene's own update. */
  update() {
    if (this.page === null) return;
    if (!this.dirty) return;
    this.dirty = false; // before the refresh, so an edit it makes is a new signal
    this.page.refresh();
  }

  _title() {
    if (this.page === null) return "";
    const t = this.page.title;
    return typeof t === "function" ? t() : t;
  }
};

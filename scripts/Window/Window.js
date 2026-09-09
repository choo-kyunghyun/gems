// The gameplay window shell — ONE near-fullscreen facetOverlay a scene composes, holding every
// page it can show (the bag, a chest, the workbench, the world map, a shop) and showing one.
/**
 * A page is a plain object its UI module builds once per scene (`StorageUI.build(scene)`) and the
 * scene adds under an id — a station page under its InteractAction id, the bag under "bag":
 *   el            UIElement — the content column, stacked absolute in the card (facetTabs' shape),
 *                 so a switch is an `enabled` flip and a page keeps its sort/filter/selection
 *   title         I18n textRef or () => string; the title row reads it live
 *   refresh()     rebuild the live data — runs on open and whenever `dirty` is set
 *   onOpen(opts)  optional — the per-open parameters (a corpse's take hook)
 *   onClose()     optional
 *   titleExtra    optional UIElement mounted in the title row before the close button while the
 *                 page shows (a shop's balance)
 * add() stamps `id` and `_slot` on it. A page's own state (selection, tables, click latch) lives
 * on the page object, never on the scene; the shell's four fields are the whole window state:
 *   page    the open page, else null              target  the entity the page stands over, else -1
 *   dirty   the open page refreshes next update()  modal   the page's amount picker, else null
 * Opening over an open page REPLACES it. back() is the Esc step: the modal first, then the page.
 * The scene's E rule reads `target` (a station page closes on E, the bag has none), Interactable
 * range-closes on it, and a bag mutation anywhere sets `dirty` — refreshing whatever page shows
 * is idempotent, so a writer never asks which. update() runs at the end of the scene's update,
 * outside the UI traversal, so a refresh never destroys the widget whose click requested it.
 */
globalThis.Window = class Window {
  /** root: the scene's UI root the overlay is inserted into (after the HUD, so the veil covers it) */
  constructor(root) {
    this.page = null;
    this.target = -1;
    this.dirty = false;
    this.modal = null;
    this._pages = {}; // id -> page
    this._host = facetOverlay(() => this._title(), {
      onClose: () => this.close(),
    });
    // the page stack fills the card under the title row
    this._stack = new UIElement({ width: "100%", flexGrow: 1, flexBasis: 0 });
    this._host.body.insertChild(this._stack);
    root.insertChild(this._host);
  }

  /** register `page` under `id`; returns it */
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

  /** is the page under `id` the open one */
  is(id) {
    return this.page !== null ? this.page.id === id : false;
  }

  /** show the page under `id` over `opts.target` (-1 = none), replacing any open page */
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
      const row = this._host.titleRow;
      row.insertChild(page.titleExtra, row.children.length - 1); // before the close "x"
    }
    this._host.enabled = true;
    if (page.onOpen !== undefined) page.onOpen(opts);
    this.dirty = true;
  }

  /** close the open page and its modal; a no-op with nothing open */
  close() {
    this._dismiss();
    const page = this.page;
    if (page === null) return;
    this.page = null;
    this.target = -1;
    this.dirty = false;
    page._slot.enabled = false;
    if (page.titleExtra !== undefined)
      this._host.titleRow.removeChild(page.titleExtra);
    this._host.enabled = false;
    if (page.onClose !== undefined) page.onClose();
  }

  /** the Esc step: the modal, else the page; false when nothing was open */
  back() {
    if (this.modal !== null) {
      this._dismiss();
      return true;
    }
    if (this.page === null) return false;
    this.close();
    return true;
  }

  /**
   * hold a UIModal over the open page (an amount picker) so back()/close() dismiss it first;
   * returns it. The field clears with the modal whichever side closes it.
   */
  prompt(modal) {
    this._dismiss();
    this.modal = modal;
    const inner = modal.onClose;
    modal.onClose = () => {
      inner();
      if (this.modal === modal) this.modal = null;
    };
    return modal;
  }

  /** refresh the open page when dirty; once per frame, after the scene's own update */
  update() {
    if (this.page === null) return;
    if (!this.dirty) return;
    this.dirty = false; // before the refresh, so an edit it makes is a new signal
    this.page.refresh();
  }

  /** close the held modal, clearing the field at once (its own onClose lands after the exit) */
  _dismiss() {
    const m = this.modal;
    if (m === null) return;
    this.modal = null;
    m.close();
  }

  _title() {
    if (this.page === null) return "";
    const t = this.page.title;
    return typeof t === "function" ? t() : t;
  }
};

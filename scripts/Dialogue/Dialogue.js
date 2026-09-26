/**
 * A typewritten conversation, as a record its scene holds. A page reveals at `speed` chars/sec;
 * an advance first reveals the rest of the page, the next moves on, and past the last page the
 * record closes and fires onComplete. Revealing counts the page's raw characters, so how a view
 * lays the text out never changes when a page is done.
 */
globalThis.Dialogue = {
  SPEED: 45, // chars/sec

  make() {
    return { pages: [], page: 0, chars: 0, speed: Dialogue.SPEED, onComplete: noop };
  },

  isOpen(d) {
    return d.pages.length > 0;
  },

  /** pages: (string | {speaker?, text})[]; opts: { speed, onComplete }. */
  start(d, pages, opts = {}) {
    const list = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      if (typeof p === "string") list.push({ speaker: "", text: p });
      else list.push({ speaker: p.speaker ?? "", text: p.text ?? "" });
    }
    d.pages = list;
    d.page = 0;
    d.chars = 0;
    d.speed = opts.speed ?? Dialogue.SPEED;
    d.onComplete = opts.onComplete ?? noop;
  },

  /** Force-close without onComplete. */
  clear(d) {
    d.pages = [];
  },

  /** "" when closed or unnamed. */
  speaker(d) {
    return d.pages.length > 0 ? d.pages[d.page].speaker : "";
  },

  text(d) {
    return d.pages.length > 0 ? d.pages[d.page].text : "";
  },

  /** How many of the page's characters show. */
  shown(d) {
    return floor(d.chars);
  },

  done(d) {
    return d.pages.length > 0 ? d.chars >= d.pages[d.page].text.length : false;
  },

  /** Reveals by `dt` seconds. */
  tick(d, dt) {
    if (d.pages.length === 0) return;
    d.chars = Math.min(d.chars + d.speed * dt, d.pages[d.page].text.length);
  },

  advance(d) {
    if (d.pages.length === 0) return;
    const total = d.pages[d.page].text.length;
    if (d.chars < total) {
      d.chars = total;
      return;
    }
    d.page++;
    d.chars = 0;
    if (d.page < d.pages.length) return;
    const done = d.onComplete;
    d.pages = [];
    done();
  },
};

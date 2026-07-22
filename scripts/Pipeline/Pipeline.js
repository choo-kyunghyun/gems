// Ordered list of per-tick steps, each a `{ update(entities) }` object or a bare `function(entities)`
// (wrapped on add), so a genre composes its physics order declaratively — platformer
// `Gravity → clampFall → Solid`, top-down `Solid → Separation → Projectile`. Runs inside the
// level's tick loop (the ordering contract that brackets it: SimClock.advance).
globalThis.Pipeline = class Pipeline {
  constructor() {
    /** @type {{update: function(any): void}[]} */
    this._steps = [];
  }

  /** Append a step (chainable). @param {{update: function(any): void} | function(any): void} step @returns {Pipeline} */
  add(step) {
    this._steps.push(typeof step === "function" ? { update: step } : step);
    return this;
  }

  /** Run every step in order. @param {Entity} entities */
  update(entities) {
    for (const step of this._steps) {
      step.update(entities);
    }
  }
};

// Ordered list of per-tick steps, each a `{ update(world) }` object or a bare `function(world)`
// (wrapped on add), so a genre composes its physics order declaratively.
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

  /** Run every step in order. @param {Entity} world */
  update(world) {
    for (const step of this._steps) {
      step.update(world);
    }
  }
};

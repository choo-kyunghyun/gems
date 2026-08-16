/** Runs inside the level's tick loop — the bracketing ordering contract at SimClock.advance. */
globalThis.Pipeline = class Pipeline {
  constructor() {
    this._steps = [];
  }

  add(step) {
    this._steps.push(typeof step === "function" ? { update: step } : step);
    return this;
  }

  update(entities) {
    for (const step of this._steps) {
      step.update(entities);
    }
  }
};

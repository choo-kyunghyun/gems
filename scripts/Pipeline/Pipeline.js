globalThis.Pipeline = class Pipeline {
  constructor() {
    this._steps = [];
  }

  add(step) {
    this._steps.push(typeof step === "function" ? { update: step } : step);
    return this;
  }

  update(world) {
    for (const step of this._steps) {
      step.update(world);
    }
  }
};

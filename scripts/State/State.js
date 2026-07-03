/**
 * @typedef {Object} State
 * @property {string} current  active state id in the StateSystem pool ("" = none)
 * @property {string} next     queued state id ("" = none) — StateSystem.update applies it
 */
globalThis.State = "State";

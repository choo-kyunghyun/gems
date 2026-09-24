/**
 * @typedef {Object} State
 * @property {string} current  active state id ("" = none)
 * @property {string} next     queued state id ("" = none), applied on the next update
 */
globalThis.State = "State";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[State] = { current: "", next: "" };

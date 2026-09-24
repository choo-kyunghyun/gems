/**
 * @typedef {Object} PathResponse
 * @property {{x:number,y:number}[]} path  ordered waypoints
 * @property {number} index  the current waypoint
 */
globalThis.PathResponse = "PathResponse";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[PathResponse] = { index: 0 };

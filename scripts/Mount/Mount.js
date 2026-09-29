/**
 * Marks a carrier — an entity others ride — and lays out its seats. A seat is a point off the
 * carrier's Position where its rider stands; its `role` is the consumer's to read, never this
 * area's. A `hidden` seat takes its rider out of sight and out of every collision while it sits.
 *
 * @typedef {Object} MountSeat
 * @property {number} x
 * @property {number} y
 * @property {string} [role]    what the seat lets its rider do; absent = "ride"
 * @property {boolean} [hidden]
 * @property {{x:number,y:number}} [exit]  where the rider steps off, off the carrier's
 *                              Position; absent = the seat point
 *
 * @typedef {Object} Mount
 * @property {MountSeat[]} seats  in the order a free seat is offered
 */
globalThis.Mount = "Mount";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Mount] = { seats: [] };

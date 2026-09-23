/**
 * Marker: THE entity the follow camera tracks (one per store at a time). It is found by LIVE
 * query, winning over a raw target id, so the camera can never dangle a stored entity id: a map
 * transfer that re-mints the entity's id carries the marker, and the resumed map's camera just
 * finds it again. Flat empty data ({}) — presence is the signal.
 * @typedef {Object} CameraFocus
 */
globalThis.CameraFocus = "CameraFocus";

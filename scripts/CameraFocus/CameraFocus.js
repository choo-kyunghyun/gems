globalThis.CameraFocus = "CameraFocus";
/**
 * Marker: THE entity the follow camera tracks (one per store at a time). `CameraFollow.targetId()`
 * resolves its target by LIVE query — an entity carrying this wins over the raw `target` id
 * fallback — so the camera can never dangle a stored entity id: a map transfer that re-mints the
 * player's id (World.take/put across levels) carries the marker with the EntitySnapshot, and the
 * resumed map's camera just finds it again.
 * Flat empty data ({}) — presence is the signal, exactly like the Playable marker.
 * @typedef {Object} CameraFocus
 */

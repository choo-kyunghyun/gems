/**
 * Follow policy for the camera entity: eases the zoom, tilts by the zoom curve, and eases the
 * look-at onto the `CameraFocus` carrier, clamped inside `bounds`. Its tuning is the installer's,
 * not the save's: minted on every activation, with `zoom` seeded from the persisted Camera so the
 * view resumes where it was.
 * @typedef {Object} CameraFollow
 * @property {number} lerp  look-at smoothing per frame, 0..1
 * @property {number} pitch  degrees; the zoom curve overwrites it every update when set
 * @property {number|undefined} pitchLo  the zoom curve — degrees at `zoomLo` easing linearly to `pitchHi` at `zoomHi`; undefined = the fixed `pitch`
 * @property {number|undefined} pitchHi
 * @property {number|undefined} zoomLo
 * @property {number|undefined} zoomHi
 * @property {{x1:number,y1:number,x2:number,y2:number}|undefined} bounds  world-px look-at clamp; undefined = unclamped
 * @property {number|undefined} viewCap  max view width in world px (zoom-out floor); undefined = none
 * @property {number} zoomTarget  the wheel's destination the eased Camera.zoom chases
 * @property {number} zoomHome  where `zoomButton` resets to
 * @property {number} zoomMin
 * @property {number} zoomMax
 * @property {number} zoomStep  the continuous wheel ratio, used when `zoomSteps` is undefined
 * @property {number[]|undefined} zoomSteps  ascending zoom STOPS the wheel snaps through (integer stops keep every texel the same screen size)
 * @property {number} zoomLerp  zoom smoothing per frame, 0..1
 * @property {number} zoomButton  the mouse button that resets to `zoomHome`
 */
globalThis.CameraFollow = "CameraFollow";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[CameraFollow] = {
  lerp: 0.1,
  pitch: 0,
  zoomTarget: 1,
  zoomHome: 1,
  zoomMin: 0.5,
  zoomMax: 4,
  zoomStep: 0.1,
  zoomLerp: 0.2,
  zoomButton: mb_middle,
};

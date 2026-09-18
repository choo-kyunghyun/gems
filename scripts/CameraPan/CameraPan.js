/**
 * Pan policy for the camera entity (CameraSystem): a 2D inspector camera — drag `button` to pan,
 * wheel zooms toward the cursor. At zoom 1 with the look-at on the surface centre, world coords
 * equal screen pixels, which is what lets an editor keep working in the plain room cursor
 * (Input.pointer.roomX/roomY). Unlike CameraFollow's eased, screen-centred zoom, this one is
 * instant and CURSOR-anchored: the world point under the pointer stays put — an inspector zooms
 * into what you are pointing at, a game camera into what you are watching. Mint it with
 * `Cameras.pan(opt)`.
 * @typedef {Object} CameraPan
 * @property {number} zoomMin
 * @property {number} zoomMax
 * @property {number} zoomStep  wheel ratio per notch
 * @property {number} button  the drag mouse button
 * @property {boolean} dragging  drag in progress (the policy's own state)
 * @property {number} mx  the pointer at the last drag step, surface px
 * @property {number} my
 */
globalThis.CameraPan = "CameraPan";

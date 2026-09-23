/**
 * Pan policy for a camera entity: a 2D inspector camera that pans on a drag and zooms instantly
 * toward the cursor, keeping the world point under the pointer in place — an inspector zooms into
 * what you point at. At zoom 1 with the look-at on the surface centre, world coords equal screen
 * pixels, so an editor can keep working in the plain room cursor.
 * @typedef {Object} CameraPan
 * @property {number} zoomMin
 * @property {number} zoomMax
 * @property {number} zoomStep  wheel ratio per notch
 * @property {number} button
 * @property {boolean} dragging  the policy's own state
 * @property {number} mx  the pointer at the last drag step, surface px
 * @property {number} my
 */
globalThis.CameraPan = "CameraPan";

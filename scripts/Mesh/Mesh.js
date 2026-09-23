/**
 * Real depth-writing 3D geometry for boxy furniture and machines, so bodies sort against it
 * per-pixel with no manual layering. Position is the footprint center; `height` rises toward
 * the camera (world -z). Flat, export-safe scalars only: a color fills a face when its sprite is
 * unset, and tints the sprite when set.
 *
 * @typedef {Object} Mesh
 * @property {string} [model]     vox model name; when set, the box fields are ignored for drawing
 * @property {number} [scale]     uniform model scale (default 1); visual-only, the BBox stays
 *                                authored. Voxels read style-visible past ~1.5×
 * @property {number} [xscale]    per-axis override (world x); negative mirrors
 * @property {number} [yscale]    per-axis override (world y)
 * @property {number} [zscale]    per-axis override (world z)
 * @property {number} [yaw]       degrees about the up axis, pivoting on the footprint center;
 *                                visual-only, so author the swapped footprint for a 90° turn
 * @property {number} [pitch]     tilt in degrees about world x; vox models have no bottom faces,
 *                                so a tip past ~90° shows a hollow underside
 * @property {number} [roll]      tilt in degrees about world y (same bottom caveat)
 * @property {number} width       footprint x extent (world px)
 * @property {number} depth       footprint y extent (world px)
 * @property {number} height      vertical extent (world px)
 * @property {number} topColor    top face fill / sprite tint
 * @property {number} frontColor  front face fill / sprite tint
 * @property {GMSprite} [topSprite]
 * @property {GMSprite} [frontSprite]
 * @property {number} [alpha]     whole-box alpha (default 1); keep faces opaque
 */
globalThis.Mesh = "Mesh";

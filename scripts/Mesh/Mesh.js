/**
 * VOLUME category of the art projection contract (RenderBillboard): boxy
 * furniture/machines (bench, table, bed, crate, terminal) drawn by RenderMesh as real
 * depth-writing 3D geometry, so bodies sort against deep furniture per-pixel — no manual
 * layering. The counterpart of Visual: Visual = sprite/billboard, Mesh = 3D geometry.
 * Position is the footprint CENTER (BBox convention); `height` rises toward the camera
 * (world -z, the RenderBillboard convention). Flat, export-safe scalars only: face sprites
 * are NAMES resolved at draw time (sprite_exists-guarded, like UISlots), colors are GM
 * ints — a color fills the face when its sprite is unset, and tints the sprite when set.
 *
 * @typedef {Object} Mesh
 * @property {string} [model]     vox model NAME (meshes/<model>.vox, runtime-meshed by Vox) — when set,
 *                                RenderMesh submits the frozen mesh and every field below
 *                                is ignored for drawing (footprint fields still document size)
 * @property {number} [scale]     uniform model scale (default 1; model path only — analytic
 *                                boxes size via width/depth/height). Visual-only: BBox stays
 *                                authored. A spawn-time `size` (EntityPreset._bakeMesh) folds
 *                                into these fields AND the BBox together, so authored values
 *                                stay the archetype's basic factor. Note a scaled model's
 *                                voxels change apparent size — fine for variation,
 *                                style-visible past ~1.5×
 * @property {number} [xscale]    per-axis override (world x — width); negative mirrors
 * @property {number} [yscale]    per-axis override (world y — depth)
 * @property {number} [zscale]    per-axis override (world z — height)
 * @property {number} [yaw]       degrees about the up axis, pivoting on the footprint center
 *                                (default 0). Visual-only like scale: the BBox stays
 *                                axis-aligned — author the swapped footprint for a 90° turn of
 *                                oblong furniture. Vox models carry all four side faces, so any
 *                                facing renders solid and sh_meshlit lights it correctly (the
 *                                packed normals rotate with the world matrix). The analytic box
 *                                rotates its two authored faces (its "front" stays local south).
 * @property {number} [pitch]     tilt in degrees about world x (default 0). Vox models have no
 *                                BOTTOM faces — a tip past ~90° shows a hollow underside.
 * @property {number} [roll]      tilt in degrees about world y (default 0; same bottom caveat)
 * @property {number} width       footprint x extent (world px)
 * @property {number} depth       footprint y extent (world px)
 * @property {number} height      vertical extent (world px)
 * @property {number} topColor    plan-view top face fill / sprite tint
 * @property {number} frontColor  elevation front face fill / sprite tint
 * @property {string} [topSprite]   sprite NAME stretched over the top face ("" = flat fill)
 * @property {string} [frontSprite] sprite NAME stretched over the front face ("" = flat fill)
 * @property {number} [alpha]     whole-box alpha (default 1; keep faces opaque — see RenderMesh)
 */
globalThis.Mesh = "Mesh";

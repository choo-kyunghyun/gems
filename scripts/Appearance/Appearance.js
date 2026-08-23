/**
 * Worn-gear map for a SKELETAL humanoid: a spineHuman SLOT NAME -> the sprite attached there
 * (`-1` = bare). AppearanceSystem writes the map and pushes it onto the entity's puppet.
 *
 * `dirty` is what survives a re-mint: attachments are per-INSTANCE (docs/GMRT.md), so a map
 * transfer or a load leaves a fresh puppet wearing nothing — SkeletonSystem raises the flag when
 * it mints and the next AppearanceSystem pass re-dresses it.
 *
 * DERIVED for an entity that also carries Equipment — AppearanceSystem owns exactly the slots in
 * its SLOT map and rewrites them from the equipped items. AUTHORED otherwise: a raider's outfit
 * is written straight into `slots` by its preset and rebuild never touches it.
 *
 * @typedef {Object} Appearance
 * @property {Object} slots  spine slot name -> Asset.GMSprite, or -1 for bare
 * @property {boolean} dirty pushed onto the puppet on the next pass, which clears it
 */
globalThis.Appearance = "Appearance";

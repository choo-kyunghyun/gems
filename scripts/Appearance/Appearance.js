/**
 * Worn look of a SKELETAL humanoid, in two layers AppearanceSystem composes per spineHuman slot
 * and pushes onto the entity's puppet: `slots`, the authored BASE outfit a preset writes and
 * nothing rewrites, under `gear`, the equipment OVERLAY AppearanceSystem.rebuild re-derives
 * WHOLESALE from the equipped items. A slot the overlay claims shows the item's art (or nothing —
 * `-1`, an occupied-bare claim: a one-piece covering `pants`); an unclaimed slot falls back to
 * the base — so unequipping restores the authored clothes with no memory of what was worn.
 *
 * `dirty` is what survives a re-mint: attachments are per-INSTANCE (docs/GMRT.md), so a map
 * transfer or a load leaves a fresh puppet wearing nothing — SkeletonSystem raises the flag when
 * it mints and the next AppearanceSystem pass re-dresses it.
 *
 * @typedef {Object} Appearance
 * @property {Object} slots authored base — spine slot name -> Asset.GMSprite, or -1 for bare
 * @property {Object} [gear] equipment overlay — spine slot name -> Asset.GMSprite, or -1 for
 *                           occupied-bare; absent key = unclaimed (base shows). Owned by
 *                           AppearanceSystem.rebuild; never on a doll without Equipment.
 * @property {boolean} dirty pushed onto the puppet on the next pass, which clears it
 */
globalThis.Appearance = "Appearance";

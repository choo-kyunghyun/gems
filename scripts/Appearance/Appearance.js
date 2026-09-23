/**
 * Worn look of a SKELETAL humanoid, in two layers composed per slot onto the entity's puppet:
 * `slots`, the authored BASE outfit nothing rewrites, under `gear`, the equipment OVERLAY
 * re-derived WHOLESALE from the equipped items. A slot the overlay claims shows the item's art
 * (or nothing — `-1`, an occupied-bare claim: a one-piece covering `pants`); an unclaimed slot
 * falls back to the base — so unequipping restores the authored clothes with no memory of what
 * was worn.
 *
 * `dirty` is what survives a re-mint: attachments are per-INSTANCE, so a map transfer or a load
 * leaves a fresh puppet wearing nothing until the flag gets it re-dressed.
 *
 * @typedef {Object} Appearance
 * @property {Object} slots authored base — spine slot name -> GMSprite, or -1 for bare
 * @property {Object} [gear] equipment overlay — spine slot name -> GMSprite, or -1 for
 *                           occupied-bare; absent key = unclaimed (base shows). Derived,
 *                           never authored; never on a doll without Equipment.
 * @property {boolean} dirty pushed onto the puppet on the next pass, which clears it
 */
globalThis.Appearance = "Appearance";

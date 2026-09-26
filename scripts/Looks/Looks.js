/**
 * How a spawned body is coloured and dressed: the skin and coat palettes over the white body art,
 * the rig slots each one tints, and outfits as slot maps. A pick is hashed from the spawn cell, so
 * a regenerated level's body keeps its look.
 */
globalThis.Looks = {
  // tints over the white body art
  SKINS: ["#e8b890", "#d19a6b", "#a2714c"],

  // the body parts only: a garment or gear slot keeps its authored colours, which a whole-rig
  // colour would wash
  SKIN_SLOTS: ["head", "eyes", "mouth", "neck", "torso", "armL", "armR", "handL", "handR", "legL", "legR", "footLB", "footLF", "footRB", "footRF"],

  // tints over the white body art; white is as authored
  COATS: ["#ffffff", "#b4b4b4", "#a06a3c", "#585858"],
  // the furred parts only
  COAT_SLOTS: ["torso", "head", "legF", "legB"],

  /** The slot -> colour tint map. */
  skinTints(color) {
    const tints = {};
    for (let j = 0; j < Looks.SKIN_SLOTS.length; j++)
      tints[Looks.SKIN_SLOTS[j]] = color;
    return tints;
  },

  /** The descriptor's skin colour. */
  skin(s) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    const i = Math.abs(gx * 7 + gy * 13) % Looks.SKINS.length;
    return Color.parse(Looks.SKINS[i]);
  },

  /** The descriptor's coat, as the slot -> colour tint map. */
  coat(s) {
    const gx = s.gx ?? 0;
    const gy = s.gy ?? 0;
    const i = Math.abs(gx * 11 + gy * 17) % Looks.COATS.length;
    const color = Color.parse(Looks.COATS[i]);
    const tints = {};
    for (let j = 0; j < Looks.COAT_SLOTS.length; j++)
      tints[Looks.COAT_SLOTS[j]] = color;
    return tints;
  },

  /**
   * An outfit as a slot map, one sprite per slot: a slot has no tint of its own, so an outfit
   * varies by art, never by colour. `hat` is optional.
   */
  outfit(shirt, shoe, hat) {
    const slots = { shirt: shirt, shoeL: shoe, shoeR: shoe };
    if (hat !== undefined) slots.hat = hat;
    return { slots: slots, dirty: true };
  },
};

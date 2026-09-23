/**
 * Strip playback for a free-running Visual, looping its own sheet at `speed` frames/sec. The one
 * stepper every draw pass calls, so a sprite can never animate at two rates depending on which
 * pass drew it. On sim time: free-run sprites are world motion, so they pause and dilate with the
 * sim. Skeletal actors are not played here.
 */
globalThis.Animation = {
  /**
   * `sprite` is the sheet actually drawn (a placeholder when the authored one is missing);
   * returns the subimage to draw.
   */
  advance(visual, sprite) {
    if (visual.speed !== 0) {
      visual.time += visual.speed * Time.delta;
      visual.subimg = Math.floor(visual.time) % sprite_get_number(sprite);
    }
    return visual.subimg;
  },
};

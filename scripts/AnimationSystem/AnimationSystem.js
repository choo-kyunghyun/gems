/**
 * Strip playback for a FREE-RUNNING Visual — one looping its own sheet at `Visual.speed`
 * frames/sec. The draw passes (RenderEntity/RenderBillboard) call `advance` instead of
 * each stepping the component themselves, so a sprite can never animate at two rates depending
 * on which pass a scene installed. On Time.delta: free-run sprites are world motion, so they
 * pause and dilate with the sim. Skeletal actors are SkeletonSystem's.
 */
globalThis.AnimationSystem = {
  /**
   * `sprite` is the sheet actually being drawn (the placeholder substitute, when the authored one
   * is missing); returns the subimage to draw.
   */
  advance(visual, sprite) {
    if (visual.speed !== 0) {
      visual.time += visual.speed * Time.delta;
      visual.subimg = Math.floor(visual.time) % sprite_get_number(sprite);
    }
    return visual.subimg;
  },
};

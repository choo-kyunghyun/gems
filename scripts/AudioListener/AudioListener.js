/**
 * The ears for spatial audio.
 */
globalThis.AudioListener = {
  /** Once at boot: the top-down orientation, so only x drives the pan (+x = right). */
  init() {
    audio_listener_orientation(0, 0, 1, 0, -1, 0);
  },

  /** Per frame; the caller owns whose position the ears track. */
  position(x, y) {
    audio_listener_position(x, y, 0);
  },
};

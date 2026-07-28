/**
 * AudioListener — the "ears" for spatial audio (GameMaker's listener subsystem).
 * Boot orchestrated by Audio.init.
 */
globalThis.AudioListener = {
  // Once at boot: fix the 2D top-down orientation — face +z, up = -y (GM y grows down) so only x
  // drives L/R pan (+x → RIGHT). Position updates per frame via position().
  init() {
    audio_listener_orientation(0, 0, 1, 0, -1, 0);
  },

  // Move the ears to world (x, y); z fixed at 0. Called each frame by the active level, which
  // owns the policy of WHOSE position the ears track.
  position(x, y) {
    audio_listener_position(x, y, 0);
  },
};

/**
 * AudioListener — the "ears" for spatial audio (GameMaker's listener subsystem).
 * Boot orchestrated by Audio.setup.
 */
globalThis.AudioListener = class AudioListener {
  // Once at boot: fix the 2D top-down orientation — face +z, up = -y (GM y grows down) so only x
  // drives L/R pan (+x → RIGHT). Position updates per frame via position().
  static setup() {
    audio_listener_orientation(0, 0, 1, 0, -1, 0);
  }

  // Move the ears to world (x, y); z fixed at 0. Called each frame from the active camera.
  static position(x, y) {
    audio_listener_position(x, y, 0);
  }
};

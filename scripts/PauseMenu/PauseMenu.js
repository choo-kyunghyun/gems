/**
 * PauseMenu — standalone static singleton (NOT a UIComponent), like Toast / SlotDrag /
 * UINav. Gives the genre templates a pause overlay and centralizes the UINav.suspended
 * <-> pause coupling that keeps gameplay keys (Space/arrows/Enter) off the menu during
 * play (see the UINav input-collision note).
 *
 * Usage from a genre scene:
 *   create(openScene): PauseMenu.arm(openScene)          // enter gameplay context (nav off)
 *   step() first line:  if (PauseMenu.update()) return;  // open on Esc/Start, freeze while paused
 * obj_game calls PauseMenu.reset() on every scene swap (next to UINav.reset()).
 *
 * Built on gemsModal (GemsContainers) — its UIModal already supplies the dimmed
 * exclusive backdrop, Esc/backdrop close, and navExclusive(), so while paused nav is
 * restricted to the modal and the rest of the UI is blocked.
 */
globalThis.PauseMenu = class PauseMenu {
  static paused = false;
  static _modal = null; // the open UIModal handle, or null
  static _openScene = null; // navigation callback used by the Quit button

  // Enter gameplay context: suspend menu nav and remember how to leave the scene.
  static arm(openScene) {
    PauseMenu._openScene = openScene;
    PauseMenu.paused = false;
    UINav.suspended = true;
  }

  // Call at the top of a genre scene's step(); returns true while paused so the caller
  // early-returns (no ticks run, no gameplay input sampled — the sim is frozen).
  //
  // UINav.suspended is driven HERE every frame (true while playing, false while paused)
  // rather than toggled in the modal's onClose. onClose fires when the close animation
  // ends, which on Quit can land AFTER the scene swap's UINav.reset() — re-suspending the
  // lobby and killing keyboard nav until the next swap. Frame-driving it from the scene
  // that owns "am I playing" is race-free: menu scenes never call this, so the lobby keeps
  // whatever reset() set (false).
  static update() {
    if (PauseMenu.paused) {
      UINav.suspended = false; // nav must reach the modal
      // Gamepad Start toggles the menu closed (Esc-close is handled by UIModal itself).
      if (PauseMenu._modal !== null && PauseMenu._startPressed()) {
        PauseMenu._modal.close();
      }
      return true;
    }
    UINav.suspended = true; // active gameplay → keep gameplay keys off the menu
    if (PauseMenu._openPressed()) {
      PauseMenu._open();
      return true;
    }
    return false;
  }

  static _open() {
    PauseMenu.paused = true;
    UINav.suspended = false; // the modal must be nav-reachable
    PauseMenu._modal = gemsModal({
      title: I18n.textRef("PAUSE_TITLE"),
      buttons: [
        { label: I18n.textRef("PAUSE_RESUME"), primary: true }, // close -> onClose -> resume
        // keepOpen: leave the modal up (sim frozen) through the quit fade; the scene
        // swap's PauseMenu.reset() closes it. Closing here would let onClose clear
        // `paused` mid-fade and briefly run the sim behind the cover.
        {
          label: I18n.textRef("PAUSE_QUIT"),
          keepOpen: true,
          onClick: () => PauseMenu._openScene(SCENES.lobby),
        },
      ],
      // Resume / Esc / backdrop: just leave paused — the next gameplay frame re-suspends
      // nav via update(). suspend state is NOT touched here (see update() note).
      onClose: () => {
        PauseMenu.paused = false;
        PauseMenu._modal = null;
      },
    });
  }

  // Cleared on every scene swap from obj_game; defensively closes a still-open modal
  // (the modal root self-removes via its own onUpdate).
  static reset() {
    if (PauseMenu._modal !== null) PauseMenu._modal.close();
    PauseMenu.paused = false;
    PauseMenu._modal = null;
    PauseMenu._openScene = null;
  }

  static _openPressed() {
    return (
      keyboard_check_pressed(vk_escape) ||
      (gamepad_is_connected(0) && gamepad_button_check_pressed(0, gp_start))
    );
  }

  static _startPressed() {
    return gamepad_is_connected(0) && gamepad_button_check_pressed(0, gp_start);
  }
};

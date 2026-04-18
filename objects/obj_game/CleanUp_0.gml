UIManager.remove(self.overlay);
self.overlay.destroy();
UIManager.destroy();

Input.cleanup();
I18n.cleanup();

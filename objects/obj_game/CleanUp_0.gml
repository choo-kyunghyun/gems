UIManager.remove(self.overlay.id);
self.overlay.destroy();
UIManager.destroy();

Input.cleanup();
I18n.cleanup();

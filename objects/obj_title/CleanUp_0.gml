if (self.ui_root != undefined) {
    UIManager.remove(self.ui_root);
    self.ui_root.destroy();
    self.ui_root = undefined;
}

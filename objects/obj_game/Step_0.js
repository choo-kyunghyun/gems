UI.update();
if (this.scene !== null) this.scene.step();

if (this.scene !== SceneTitle && keyboard_check_pressed(vk_escape)) {
  this.closeScene();
}

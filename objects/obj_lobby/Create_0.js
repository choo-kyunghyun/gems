this.colBackground = Color.parse("#ff46a2");

this.myUI = new UIElement();
UI.insert(this.myUI);

this.spyCam = new Camera().setProjection(CAMERA_PROJECTION.PERSPECTIVE_FOV).setFrom(0, 0, -256).setTo(0, 0, 0).assign(0);

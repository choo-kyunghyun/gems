this.colBackground = Color.parse("#404349");

this.myUI = new UIElement();
UI.insert(this.myUI);

this.spyCam = new Camera().setProjection(CAMERA_PROJECTION.PERSPECTIVE_FOV).setFrom(0, 0, -256).setTo(0, 0, 0).assign(0);

this.renderer = new Renderer();
this.renderer.insert(new RenderEntity());

this.player = Entity.create();
Hit.set(this.player, 100);
Name.set(this.player, "Player");
Position.set(this.player, -32, -64, 0);
Visual.set(this.player, spr_hana, 0);

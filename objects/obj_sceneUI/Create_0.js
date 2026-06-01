this.ui = new UIElement({ width: "100%", height: "100%", padding: 16, paddingTop: 64, gap: 16, flexWrap: "wrap" });
UI.insert(this.ui);

this.logo = new UIElement({ width: 320, height: 160 });
this.logo.addComponent(new UIImage({ sprite: spr_hana }));
this.ui.insertChild(this.logo);

this.panel = new UIElement({ width: 320, height: 320 });
this.panel.addComponent(new UIPanel({ color: c_olive, alpha: 0.5, rad: 32 }));
this.ui.insertChild(this.panel);

this.text = new UIElement();
this.text.addComponent(new UIText({ textRef: (() => "A0-X2"), angle: 32, xscale: 2, color: Color.parse("#f0d0a0"), alpha: 0.5 }));
this.ui.insertChild(this.text);

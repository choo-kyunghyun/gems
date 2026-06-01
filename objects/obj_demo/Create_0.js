this.background = Color.parse("#222222");
this.scene = -1;

draw_set_font(I18n.font("normal_36"));

this.openScene = function(scene) {
    if (this.scene !== -1) this.closeScene();
    this.scene = scene;
    instance_create_depth(0, 0, 0, this.scene);
    UI.setEnabled(this.ui, false);
};

this.closeScene = function() {
    instance_destroy(this.scene);
    this.scene = -1;
    UI.setEnabled(this.ui, true);
};

let makeButton = function(text, scene) {
    const t = new UIElement();
    t.addComponent(new UIText({ textRef: (() => text), color: Color.parse("#c0c0c0") }));
    
    const e = new UIElement({ width: 360, height: 120, alignItems: "center", justifyContent: "center" });
    e.addComponent(new UIPanel({ color: Color.parse("#333333"), rad: 16 }));
    e.addComponent(new UITrigger({
        onClick: (() => this.openScene(scene)),
        onHover: (() => t.getComponent(UIText).color = Color.parse("#ffffff")),
        onLeave: (() => t.getComponent(UIText).color = Color.parse("#c0c0c0")),
        onDown: (() => e.getComponent(UIPanel).color = Color.parse("#303030")),
        onUp: (() => e.getComponent(UIPanel).color = Color.parse("#333333")),
    }));
    e.insertChild(t);
    
    return e;
};

this.ui = new UIElement({ width: "100%", height: "100%", padding: 16, gap: 16 });
UI.insert(this.ui);

this.header = new UIElement({ width: "100%", height: 80, paddingHorizontal: 16, paddingVertical: 4 });
this.header.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 16 }));
this.ui.insertChild(this.header);

this.title = new UIElement();
this.title.addComponent(new UIText({ textRef: (() => "G.E.M.S.") }));
this.header.insertChild(this.title);

this.menu = new UIElement({ flexWrap: "wrap", gap: 16 });
this.ui.insertChild(this.menu);

this.menu.insertChild(makeButton("UI", obj_sceneUI));
this.menu.insertChild(makeButton("Time", obj_sceneTime));
this.menu.insertChild(makeButton("Input", obj_sceneInput));

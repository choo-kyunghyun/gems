globalThis.SceneTitle = new (class extends Scene {
  create(openScene) {
    this.ui = new UIElement({
      width: "100%",
      height: "100%",
      padding: 16,
      gap: 16,
    });
    UI.insert(this.ui);

    const header = new UIElement({
      width: "100%",
      height: 80,
      paddingHorizontal: 16,
      paddingVertical: 4,
    });
    header.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 16 }));
    this.ui.insertChild(header);

    const title = new UIElement();
    title.addComponent(new UIText({ textRef: () => "G.E.M.S." }));
    header.insertChild(title);

    const menu = new UIElement({ flexWrap: "wrap", gap: 16 });
    this.ui.insertChild(menu);

    const makeButton = (text, scene) => {
      const t = new UIElement();
      t.addComponent(
        new UIText({ textRef: () => text, color: Color.parse("#c0c0c0") }),
      );

      const e = new UIElement({
        width: 360,
        height: 120,
        alignItems: "center",
        justifyContent: "center",
      });
      e.addComponent(new UIPanel({ color: Color.parse("#333333"), rad: 16 }));
      e.addComponent(
        new UITrigger({
          onClick: () => openScene(scene),
          onHover: () => (t.getComponent(UIText).color = Color.parse("#ffffff")),
          onLeave: () => (t.getComponent(UIText).color = Color.parse("#c0c0c0")),
          onDown: () => (e.getComponent(UIPanel).color = Color.parse("#303030")),
          onUp: () => (e.getComponent(UIPanel).color = Color.parse("#333333")),
        }),
      );
      e.insertChild(t);
      return e;
    };

    menu.insertChild(makeButton("UI", obj_sceneUI));
    menu.insertChild(makeButton("Time", obj_sceneTime));
    menu.insertChild(makeButton("Input", obj_sceneInput));
  }

  destroy() {
    UI.remove(this.ui);
    this.ui.destroy();
  }
})();

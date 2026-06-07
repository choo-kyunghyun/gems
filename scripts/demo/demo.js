// ── UI Helpers ────────────────────────────────────────────────

function makeButton(label, onClick) {
  const textRef = typeof label === "function" ? label : () => label;
  const btn = new UIElement({ height: 48, width: "100%" });
  btn.addComponent(new UIPanel({ color: Color.parse("#3a3a3a"), rad: 8 }));
  btn.addComponent(
    new UIButton({
      colorNormal: Color.parse("#3a3a3a"),
      colorHover: Color.parse("#505050"),
      colorPress: Color.parse("#2a2a2a"),
      onClick,
    }),
  );
  const text = new UIElement();
  text.addComponent(new UIText({ textRef, halign: fa_center }));
  btn.insertChild(text);
  return btn;
}

function makeSection(title) {
  const section = new UIElement({ width: "100%", padding: 12, gap: 10 });
  section.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 12 }));
  const header = new UIElement();
  const textRef = typeof title === "function" ? title : () => title;
  header.addComponent(new UIText({ textRef, color: Color.parse("#aaaaaa") }));
  section.insertChild(header);
  return section;
}

function makeRow(label, control) {
  const row = new UIElement({ width: "100%", gap: 8 });
  const lbl = new UIElement();
  const textRef = typeof label === "function" ? label : () => label;
  lbl.addComponent(new UIText({ textRef }));
  row.insertChild(lbl);
  row.insertChild(control);
  return row;
}

function makeSlider(key, min = 0, max = 1, step = undefined) {
  const el = new UIElement({ height: 24, width: "100%" });
  el.addComponent(
    new UISlider({
      min,
      max,
      value: Settings.get(key),
      step,
      onChange: (v) => Settings.set(key, v),
    }),
  );
  return el;
}

function makeSelect(key, items) {
  const el = new UIElement({ height: 36, width: "100%" });
  const currentVal = Settings.get(key);
  const idx = Math.max(
    0,
    items.findIndex((item) => item.value === currentVal),
  );
  el.addComponent(
    new UISelect({
      items,
      index: idx,
      onChange: (_i, value) => Settings.set(key, value),
      halign: fa_center,
    }),
  );
  return el;
}

// Releases the world / renderer / camera / UI a genre scene builds, in dependency
// order. Scenes hold these on `this`; call teardownScene(this) from destroy() after
// releasing any scene-specific resources (controllers, levels). Missing fields are
// skipped, so a partially-built scene still tears down safely.
function teardownScene(scene) {
  if (scene.camera) scene.camera.destroy();
  if (scene.renderer) scene.renderer.destroy();
  if (scene.world) scene.world.destroy();
  if (scene.ui) {
    UI.remove(scene.ui);
    scene.ui.destroy();
  }
}

// ── SceneRegistry ────────────────────────────────────────────

globalThis.SceneRegistry = {
  _entries: [],
  add(factory, opts) {
    this._entries.push({
      factory,
      label: opts.label,
      category: opts.category ?? "기타",
    });
  },
  byCategory() {
    const result = [];
    const index = {};
    for (const e of this._entries) {
      if (!index[e.category]) {
        index[e.category] = [];
        result.push({ category: e.category, entries: index[e.category] });
      }
      index[e.category].push(e);
    }
    return result;
  },
};

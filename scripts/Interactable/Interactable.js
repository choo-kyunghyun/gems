// Interaction engine for the RPG scene: each frame picks one target entity carrying an `Interaction`
// component — under the cursor if in range, else nearest in range — gives it a highlight + prompt;
// E runs its action. The action itself is data (InteractAction registry, RPG set in RpgInteractions),
// so this engine is generic dispatch, not a per-kind switch — from opening a window to feeding the
// player. Activation is E, not left-click, because combat fires on left-click (the mouse only CHOOSES
// the target). The world cursor is scene.mouseWorld (the scene's per-frame pitch-aware latch — NOT
// mouse_x/mouse_y, which are wrong under the pitched camera). Per-frame/open state on the scene (_inter*).
// Build once in create() after player + ui; update() each step, drawTarget() in draw() (world).
// THE STATION-WINDOW DRIVER: update() also owns the open windows' lifecycle — it range-closes the
// one recorded in scene._interOpenId and sets its _*Dirty flag when the target's contents change.
// The protocol every station window shares: the manager refreshes only when its flag is set, so
// gameplay code that mutates an inventory elsewhere must set the flag (e.g. scene._storeDirty).
globalThis.Interactable = {
  RADIUS: 72, // interact range (px); 32px-cell scale

  build(scene) {
    scene._interTarget = -1;
    scene._interKind = "";
    scene._interOpenId = -1;

    // proximity prompt — shown only while a station is in range and no window is open;
    // label re-resolves each draw to track the target's kind
    const prompt = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 84,
      alignItems: "center",
    });
    const pill = new UIElement({
      width: 240,
      height: 42,
      justifyContent: "center",
      alignItems: "center",
    });
    pill.addComponent(
      new UIPanel({
        color: gemsColor(GemsTheme.panel),
        color2: gemsColor(GemsTheme.panelLo),
        rad: GemsTheme.radius,
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
        shadow: 8,
        highlight: 1,
      }),
    );
    pill.insertChild(
      gemsLabel(() => Interactable._promptText(scene), {
        halign: fa_center,
        color: GemsTheme.text,
      }),
    );
    prompt.insertChild(pill);
    prompt.enabled = false;
    scene._interPrompt = prompt;
    scene.ui.insertChild(prompt);

    StorageUI.build(scene);
    CraftingUI.build(scene); // the workbench window — also hosts the weapon-mod panel (Toolkit module)
  },

  _promptText(scene) {
    const def = InteractAction.get(scene._interKind);
    return def === undefined ? "" : I18n.text(def.prompt);
  },

  // Per-frame: pick target, drive prompt/highlight, refresh the open+dirty window. E is NOT read
  // here — the scene's arbiter (sceneRpg._dispatchInteract) decides station-vs-NPC and calls
  // activate()/closeAll(), so one E press can't fire two handlers.
  update(scene) {
    Interactable._pick(scene);

    // opened station left range → close
    if (
      (scene._storeOpen || scene._craftOpen) &&
      !Interactable._inRange(scene, scene._interOpenId)
    ) {
      Interactable._closeAll(scene);
    }

    scene._interPrompt.enabled =
      scene._interTarget !== -1 && !scene._storeOpen && !scene._craftOpen;

    if (scene._storeOpen && scene._storeDirty) {
      StorageUI.refresh(scene);
      scene._storeDirty = false;
    }
    if (scene._craftOpen && scene._craftDirty) {
      CraftingUI.refresh(scene); // refreshes the active panel (recipes OR the weapon-mod view)
      scene._craftDirty = false;
    }
  },

  // ── Arbiter hooks (called by the scene's interact dispatcher)
  // open/claim the current target; the scene calls this when the station wins this E press
  activate(scene) {
    Interactable._open(scene);
  },

  // close any open station window
  closeAll(scene) {
    Interactable._closeAll(scene);
  },

  // true when the cursor is over entity `id`'s BBox — lets the scene break a station-vs-NPC tie
  isCursorOver(scene, id) {
    if (id === -1) return false;
    const pos = scene.entities.get(Position, id);
    if (pos === undefined) return false;
    return Interactable._mouseInside(
      pos,
      scene.entities.get(BBox, id),
      scene.mouseWorld,
    );
  },

  // pick target = station under the mouse (if in range), else nearest in range
  _pick(scene) {
    const entities = scene.entities;
    const p = entities.get(Position, scene.playerId);
    if (p === undefined) {
      scene._interTarget = -1;
      scene._interKind = "";
      return;
    }
    const rSq = Interactable.RADIUS * Interactable.RADIUS;
    let nearest = -1;
    let nearestSq = rSq;
    let mousePick = -1;
    let mouseSq = Infinity;

    const ids = entities.query(Interaction);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const pos = entities.get(Position, id);
      if (pos === undefined) continue;
      const dPlayer = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (dPlayer >= rSq) continue; // out of interact range
      if (dPlayer < nearestSq) {
        nearestSq = dPlayer;
        nearest = id;
      }
      if (
        Interactable._mouseInside(pos, entities.get(BBox, id), scene.mouseWorld)
      ) {
        const dMouse =
          (pos.x - scene.mouseWorld.x) ** 2 + (pos.y - scene.mouseWorld.y) ** 2;
        if (dMouse < mouseSq) {
          mouseSq = dMouse;
          mousePick = id;
        }
      }
    }

    const target = mousePick !== -1 ? mousePick : nearest;
    scene._interTarget = target;
    if (target !== -1) {
      const comp = entities.get(Interaction, target);
      scene._interKind = comp !== undefined ? comp.kind : "";
    } else {
      scene._interKind = "";
    }
  },

  // true when the world cursor `m` ({x,y} — the scene's per-frame pitch-aware latch) is inside
  // the entity's world BBox (offset from Position)
  _mouseInside(pos, bbox, m) {
    if (bbox === undefined) return false;
    const w = bbox.width;
    const h = bbox.height;
    if (!(w > 0) || !(h > 0)) return false;
    const left = pos.x + bbox.x;
    const top = pos.y + bbox.y;
    return m.x >= left && m.x <= left + w && m.y >= top && m.y <= top + h;
  },

  _inRange(scene, id) {
    if (id === -1) return false;
    const entities = scene.entities;
    const p = entities.get(Position, scene.playerId);
    const pos = entities.get(Position, id);
    if (p === undefined || pos === undefined) return false;
    const rSq = Interactable.RADIUS * Interactable.RADIUS;
    return (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2 < rSq;
  },

  // dispatch the target's Interaction via the registry: look up its `kind` and run the def. A window
  // action's run() sets scene._interOpenId itself (so this stays generic — instant vs window is the
  // def's concern, not the engine's). New interactions are a data entry in InteractAction, not here.
  _open(scene) {
    const id = scene._interTarget;
    const comp = scene.entities.get(Interaction, id);
    if (comp === undefined) return;
    const def = InteractAction.get(comp.kind);
    if (def === undefined) return;
    def.run({
      scene,
      entities: scene.entities,
      id,
      comp,
      playerId: scene.playerId,
    });
  },

  _closeAll(scene) {
    if (scene._storeOpen) StorageUI.close(scene);
    if (scene._craftOpen) CraftingUI.close(scene);
    scene._interOpenId = -1;
  },

  // world-space highlight outline around the target's BBox; called from scene.draw() after the world
  drawTarget(scene) {
    const id = scene._interTarget;
    if (id === -1) return;
    const entities = scene.entities;
    const pos = entities.get(Position, id);
    const bbox = entities.get(BBox, id);
    if (pos === undefined || bbox === undefined) return;
    const w = bbox.width;
    const h = bbox.height;
    if (!(w > 0) || !(h > 0)) return; // unlaid / NaN bbox guard
    const left = pos.x + bbox.x;
    const top = pos.y + bbox.y;
    draw_set_color(c_yellow);
    draw_rectangle(left - 4, top - 4, left + w + 4, top + h + 4, true);
    draw_set_color(c_white);
  },
};

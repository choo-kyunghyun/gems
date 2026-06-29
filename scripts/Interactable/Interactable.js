// Station-selection module for the RPG scene. Each frame picks one target Station — under the
// cursor if in range, else nearest in range — gives it a highlight + prompt; E opens its window.
// Activation is E, not left-click, because combat fires on left-click (the mouse only CHOOSES the
// target). mouse_x/mouse_y are world-space here. Per-frame/open state lives on the scene (_inter*).
// Build once in create() after player + ui; update() each step, drawTarget() in draw() (world).
globalThis.Interactable = {
  RADIUS: 36, // interact range (px); 16px-cell scale, see GEMS.md

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
    if (scene._interKind === "workbench") return I18n.text("CRAFT_PROMPT");
    if (scene._interKind === "storage") return I18n.text("STORAGE_PROMPT");
    if (scene._interKind === "claim") return I18n.text("CLAIM_PROMPT");
    if (scene._interKind === "arcade") return I18n.text("ARCADE_PROMPT");
    if (scene._interKind === "bed") return I18n.text("BED_PROMPT");
    return "";
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
    const pos = scene.world.get(Position, id);
    if (pos === undefined) return false;
    return Interactable._mouseInside(pos, scene.world.get(BBox, id));
  },

  // pick target = station under the mouse (if in range), else nearest in range
  _pick(scene) {
    const world = scene.world;
    const p = world.get(Position, scene.ctrl.id);
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

    const ids = world.query(Station);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const pos = world.get(Position, id);
      if (pos === undefined) continue;
      const dPlayer = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (dPlayer >= rSq) continue; // out of interact range
      if (dPlayer < nearestSq) {
        nearestSq = dPlayer;
        nearest = id;
      }
      if (Interactable._mouseInside(pos, world.get(BBox, id))) {
        const dMouse = (pos.x - mouse_x) ** 2 + (pos.y - mouse_y) ** 2;
        if (dMouse < mouseSq) {
          mouseSq = dMouse;
          mousePick = id;
        }
      }
    }

    const target = mousePick !== -1 ? mousePick : nearest;
    scene._interTarget = target;
    if (target !== -1) {
      const st = world.get(Station, target);
      scene._interKind = st !== undefined ? st.kind : "";
    } else {
      scene._interKind = "";
    }
  },

  // true when the mouse is inside the entity's world BBox (offset from Position)
  _mouseInside(pos, bbox) {
    if (bbox === undefined) return false;
    const w = bbox.width;
    const h = bbox.height;
    if (!(w > 0) || !(h > 0)) return false;
    const left = pos.x + bbox.x;
    const top = pos.y + bbox.y;
    return (
      mouse_x >= left &&
      mouse_x <= left + w &&
      mouse_y >= top &&
      mouse_y <= top + h
    );
  },

  _inRange(scene, id) {
    if (id === -1) return false;
    const world = scene.world;
    const p = world.get(Position, scene.ctrl.id);
    const pos = world.get(Position, id);
    if (p === undefined || pos === undefined) return false;
    const rSq = Interactable.RADIUS * Interactable.RADIUS;
    return (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2 < rSq;
  },

  _open(scene) {
    const id = scene._interTarget;
    // claim / arcade / bed are instant actions, not windows
    if (scene._interKind === "claim") {
      BuildMode.claim(scene, id);
      return;
    }
    if (scene._interKind === "arcade") {
      scene._openArcade();
      return;
    }
    if (scene._interKind === "bed") {
      scene._sleep();
      return;
    }
    scene._interOpenId = id;
    if (scene._interKind === "storage") StorageUI.open(scene, id);
    else if (scene._interKind === "workbench") CraftingUI.open(scene, id);
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
    const world = scene.world;
    const pos = world.get(Position, id);
    const bbox = world.get(BBox, id);
    if (pos === undefined || bbox === undefined) return;
    const w = bbox.width;
    const h = bbox.height;
    if (!(w > 0) || !(h > 0)) return; // unlaid / NaN bbox guard
    const left = pos.x + bbox.x;
    const top = pos.y + bbox.y;
    draw_set_color(c_yellow);
    draw_rectangle(left - 2, top - 2, left + w + 2, top + h + 2, true);
    draw_set_color(c_white);
  },
};

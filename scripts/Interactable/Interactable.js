// Station-selection module for the RPG scene. Any entity carrying a Station component is
// interactable. Each frame this picks one target station: the one under the mouse cursor
// (BBox hit-test) if it's within range, otherwise the nearest within range. The target gets a
// world-space highlight outline and a context prompt; pressing `interact` (E) opens the matching
// window — StorageUI for kind "storage", CraftingUI for kind "workbench".
//
// Activation is E, not left-click, because the RPG's combat fires on left-click (mouse aim) —
// the mouse only CHOOSES the target. `mouse_x`/`mouse_y` are world-space here (the view
// transform is applied; see RpgController aim).
//
// All per-frame/open state lives on the SCENE (namespaced `_inter*`, plus the windows'
// own `_store*`/`_craft*`). Build once in create() after the player + ui exist; call
// update() each step and drawTarget() in draw() (world space).
//
// Scene contract: scene.world, scene.ctrl.id (player), scene.ui.
globalThis.Interactable = {
  RADIUS: 72, // interact range (px) from the player to a station

  build(scene) {
    scene._interTarget = -1;
    scene._interKind = "";
    scene._interOpenId = -1;

    // Proximity prompt: a compact centered card near the bottom, shown only while a
    // station is in range and no window is open. The label re-resolves each draw, so it
    // tracks the current target's kind.
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
    CraftingUI.build(scene);
    WeaponModUI.build(scene);
  },

  _promptText(scene) {
    if (scene._interKind === "workbench") return I18n.text("CRAFT_PROMPT");
    if (scene._interKind === "modbench") return I18n.text("MOD_PROMPT");
    if (scene._interKind === "storage") return I18n.text("STORAGE_PROMPT");
    if (scene._interKind === "claim") return I18n.text("CLAIM_PROMPT");
    if (scene._interKind === "arcade") return I18n.text("ARCADE_PROMPT");
    if (scene._interKind === "bed") return I18n.text("BED_PROMPT");
    return "";
  },

  // Per-frame: pick the target, drive prompt/highlight, and refresh whichever window is
  // open + dirty. The E (interact) action is NOT read here — the scene's interact arbiter
  // (sceneRpg._dispatchInteract) decides station-vs-NPC by cursor/distance and calls
  // activate()/closeAll() — so a single E press can't fire two handlers at once.
  update(scene) {
    Interactable._pick(scene);

    // The opened station left range → close (it's left behind in the world).
    if (
      (scene._storeOpen || scene._craftOpen || scene._modOpen) &&
      !Interactable._inRange(scene, scene._interOpenId)
    ) {
      Interactable._closeAll(scene);
    }

    scene._interPrompt.enabled =
      scene._interTarget !== -1 &&
      !scene._storeOpen &&
      !scene._craftOpen &&
      !scene._modOpen;

    if (scene._storeOpen && scene._storeDirty) {
      StorageUI.refresh(scene);
      scene._storeDirty = false;
    }
    if (scene._craftOpen && scene._craftDirty) {
      CraftingUI.refresh(scene);
      scene._craftDirty = false;
    }
    if (scene._modOpen && scene._modDirty) {
      WeaponModUI.refresh(scene);
      scene._modDirty = false;
    }
  },

  // ── Arbiter hooks (called by the scene's interact dispatcher) ──────────────
  // Open/claim the current target (the body of _open). The scene calls this when it has
  // decided the station — not the NPC — wins this E press.
  activate(scene) {
    Interactable._open(scene);
  },

  // Close any open station window (public wrapper of _closeAll).
  closeAll(scene) {
    Interactable._closeAll(scene);
  },

  // True when the mouse cursor is over entity `id`'s world BBox — used by the scene to let
  // the cursor break a station-vs-NPC tie.
  isCursorOver(scene, id) {
    if (id === -1) return false;
    const pos = scene.world.get(Position, id);
    if (pos === undefined) return false;
    return Interactable._mouseInside(pos, scene.world.get(BBox, id));
  },

  // Choose target = station under the mouse (if in range), else nearest in range.
  // Writes scene._interTarget / _interKind.
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

  // True when the mouse is inside the entity's world BBox (offset from Position).
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
    // Claim is an instant action, not a window — claim the build zone and bail.
    if (scene._interKind === "claim") {
      BuildMode.claim(scene, id);
      return;
    }
    // Arcade is an instant action too — push a minigame scene on top of the RPG (no window).
    if (scene._interKind === "arcade") {
      scene._openArcade();
      return;
    }
    // Bed is an instant action — start sleeping (fast-forwards time, drains Drowsiness; a key wakes).
    if (scene._interKind === "bed") {
      scene._sleep();
      return;
    }
    scene._interOpenId = id;
    if (scene._interKind === "storage") StorageUI.open(scene, id);
    else if (scene._interKind === "workbench") CraftingUI.open(scene, id);
    else if (scene._interKind === "modbench") WeaponModUI.open(scene, id);
  },

  _closeAll(scene) {
    if (scene._storeOpen) StorageUI.close(scene);
    if (scene._craftOpen) CraftingUI.close(scene);
    if (scene._modOpen) WeaponModUI.close(scene);
    scene._interOpenId = -1;
  },

  // World-space highlight outline around the current target's BBox. Called from
  // scene.draw() after the world is drawn.
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

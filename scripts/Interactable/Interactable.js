// Interaction engine for the RPG level: each frame it picks one `Interaction`-carrying target
// (under the cursor if in range, else nearest), prompts it, and runs its action on E.
/**
 * The action itself is data (InteractAction registry, RPG set in RpgInteractions), so this engine is
 * generic dispatch, not a per-kind switch — from opening a window to feeding the player. Activation
 * is E, not left-click (combat fires on left-click; the mouse only CHOOSES the target). The world
 * cursor is level.mouseWorld (the level's per-frame pitch-aware latch, see Camera). Per-frame/open
 * state on the level (_inter*). Build once in create() after player + ui; update() each step,
 * drawTarget() in draw() (world).
 *
 * THE STATION-WINDOW DRIVER: update() also owns the open windows' lifecycle — it range-closes the one
 * recorded in level._interOpenId and sets its _*Dirty flag when the target's contents change. The
 * protocol every station window shares: the manager refreshes only when its flag is set, so gameplay
 * code that mutates an inventory elsewhere must set the flag (e.g. level._storeDirty).
 */
globalThis.Interactable = {
  RADIUS: 72, // interact range (px); 32px-cell scale

  build(level) {
    level._interTarget = -1;
    level._interKind = "";
    level._interOpenId = -1;

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
      gemsLabel(() => Interactable._promptText(level), {
        halign: fa_center,
        color: GemsTheme.text,
      }),
    );
    prompt.insertChild(pill);
    prompt.enabled = false;
    level._interPrompt = prompt;
    level.ui.insertChild(prompt);

    StorageUI.build(level);
    CraftingUI.build(level); // the workbench window — also hosts the weapon-mod panel (Toolkit module)
  },

  _promptText(level) {
    const def = InteractAction.get(level._interKind);
    return def === undefined ? "" : I18n.text(def.prompt);
  },

  // Per-frame: pick target, drive prompt/highlight, refresh the open+dirty window. E is NOT read
  // here — the level's arbiter (sceneRpg._dispatchInteract) decides station-vs-NPC and calls
  // activate()/closeAll(), so one E press can't fire two handlers.
  update(level) {
    Interactable._pick(level);

    // opened station left range → close
    if (
      (level._storeOpen || level._craftOpen) &&
      !Interactable._inRange(level, level._interOpenId)
    ) {
      Interactable._closeAll(level);
    }

    level._interPrompt.enabled =
      level._interTarget !== -1 && !level._storeOpen && !level._craftOpen;

    if (level._storeOpen && level._storeDirty) {
      StorageUI.refresh(level);
      level._storeDirty = false;
    }
    if (level._craftOpen && level._craftDirty) {
      CraftingUI.refresh(level); // refreshes the active panel (recipes OR the weapon-mod view)
      level._craftDirty = false;
    }
  },

  // ── Arbiter hooks (called by the level's interact dispatcher)
  // open/claim the current target; the level calls this when the station wins this E press
  activate(level) {
    Interactable._open(level);
  },

  // close any open station window
  closeAll(level) {
    Interactable._closeAll(level);
  },

  // true when the cursor is over entity `id`'s BBox — lets the level break a station-vs-NPC tie
  isCursorOver(level, id) {
    if (id === -1) return false;
    const pos = level.entities.get(Position, id);
    if (pos === undefined) return false;
    return Interactable._mouseInside(
      pos,
      level.entities.get(BBox, id),
      level.mouseWorld,
    );
  },

  // pick target = station under the mouse (if in range), else nearest in range
  _pick(level) {
    const entities = level.entities;
    const p = entities.get(Position, level.playerId);
    if (p === undefined) {
      level._interTarget = -1;
      level._interKind = "";
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
        Interactable._mouseInside(pos, entities.get(BBox, id), level.mouseWorld)
      ) {
        const dMouse =
          (pos.x - level.mouseWorld.x) ** 2 + (pos.y - level.mouseWorld.y) ** 2;
        if (dMouse < mouseSq) {
          mouseSq = dMouse;
          mousePick = id;
        }
      }
    }

    const target = mousePick !== -1 ? mousePick : nearest;
    level._interTarget = target;
    if (target !== -1) {
      const comp = entities.get(Interaction, target);
      level._interKind = comp !== undefined ? comp.kind : "";
    } else {
      level._interKind = "";
    }
  },

  // true when the world cursor `m` ({x,y} — the level's per-frame pitch-aware latch) is inside
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

  _inRange(level, id) {
    if (id === -1) return false;
    const entities = level.entities;
    const p = entities.get(Position, level.playerId);
    const pos = entities.get(Position, id);
    if (p === undefined || pos === undefined) return false;
    const rSq = Interactable.RADIUS * Interactable.RADIUS;
    return (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2 < rSq;
  },

  // dispatch the target's Interaction via the registry: look up its `kind` and run the def. A window
  // action's run() sets level._interOpenId itself (so this stays generic — instant vs window is the
  // def's concern, not the engine's). New interactions are a data entry in InteractAction, not here.
  _open(level) {
    const id = level._interTarget;
    const comp = level.entities.get(Interaction, id);
    if (comp === undefined) return;
    const def = InteractAction.get(comp.kind);
    if (def === undefined) return;
    def.run({
      level,
      entities: level.entities,
      id,
      comp,
      playerId: level.playerId,
    });
  },

  _closeAll(level) {
    if (level._storeOpen) StorageUI.close(level);
    if (level._craftOpen) CraftingUI.close(level);
    level._interOpenId = -1;
  },

  // world-space highlight outline around the target's BBox; called from level.draw() after the world
  drawTarget(level) {
    const id = level._interTarget;
    if (id === -1) return;
    const entities = level.entities;
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

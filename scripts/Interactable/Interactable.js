// Interaction engine for the colony scene: each frame it picks one `Interaction`-carrying target
// (under the cursor if in range, else nearest), prompts it, and runs its action on E.
/**
 * THE ONE-PICK INVARIANT: everything E can act on — a station, a ripe plant, a quest NPC, a
 * merchant, a companion hired or not — carries `Interaction`, so there is exactly one candidate set
 * and one pick per frame (scene._interTarget), and the highlight, the prompt (the pill, or an
 * NPC's dialogue panel) and the E activation all derive from it. Never add a second picker over
 * another channel (an NPC query beside this one, say): the moment a press arbitrates between two
 * picks, what is highlighted and what E does can disagree.
 *
 * The action itself is data (InteractAction registry, colony set in contentInteractions), so this engine is
 * generic dispatch, not a per-kind switch — from opening a window to feeding the player. Activation
 * is E, not left-click (combat fires on left-click; the mouse only CHOOSES the target). The world
 * cursor is scene.mouseWorld (the scene's per-frame pitch-aware latch, see Camera). Per-frame/open
 * state on the scene (_inter*). Build once in create() after player + ui; update() each step,
 * drawTarget() in draw() (world).
 *
 * THE STATION-WINDOW DRIVER: update() also owns the open windows' lifecycle — it range-closes the one
 * recorded in scene._interOpenId and sets its _*Dirty flag when the target's contents change. The
 * protocol every station window shares (storage / crafting / world map / trade): the manager
 * refreshes only when its flag is set, so gameplay code that mutates an inventory elsewhere must
 * set the flag (e.g. scene._storeDirty).
 */
globalThis.Interactable = {
  RADIUS: 72, // interact range (px); 32px-cell scale

  build(scene) {
    scene._interTarget = -1;
    scene._interKind = "";
    scene._interOpenId = -1;
    scene._interPromptText = ""; // the pick's resolved pill text this frame ("" = no pill)

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
        color: facetColor(FacetTheme.panel),
        alpha: FacetTheme.cardAlpha,
        rad: FacetTheme.radius,
        border: 1,
        borderColor: facetColor(FacetTheme.border),
      }),
    );
    pill.insertChild(
      facetLabel(() => scene._interPromptText, {
        halign: fa_center,
        color: FacetTheme.text,
      }),
    );
    prompt.insertChild(pill);
    prompt.enabled = false;
    scene._interPrompt = prompt;
    scene.ui.insertChild(prompt);

    StorageUI.build(scene);
    CraftingUI.build(scene); // the workbench window — also hosts the weapon-mod panel (Toolkit module)
    WorldMapUI.build(scene); // the travel beacon's site picker
    TradeUI.build(scene); // a merchant NPC's shop
  },

  /**
   * the pill's text for the pick: the def's prompt — an I18n key, or a function of the run()
   * ctx returning one, resolved now — "" for none (no pick, or a def that prompts through its
   * own UI). update() resolves it once per frame into scene._interPromptText.
   */
  _promptText(scene) {
    const def = InteractAction.get(scene._interKind);
    if (def === undefined) return "";
    const key =
      typeof def.prompt === "function"
        ? def.prompt(Interactable._ctx(scene))
        : def.prompt;
    return key === "" ? "" : I18n.text(key);
  },

  /** the ctx a def's prompt()/run() receives, over the frame's pick */
  _ctx(scene) {
    const entities = scene.level.entities;
    return {
      scene,
      entities,
      id: scene._interTarget,
      comp: entities.get(scene._interTarget, Interaction),
      playerId: scene.playerId,
    };
  },

  /**
   * Per-frame: pick target, drive prompt/highlight, refresh the open+dirty window. E is NOT read
   * here — the scene reads it after this and calls closeAll() (a window open) or activate(), so
   * the press always lands on the pick this frame made.
   */
  update(scene) {
    Interactable._pick(scene);

    // the opened window's target left range (or is gone) → close
    if (
      Interactable.isOpen(scene) &&
      !Interactable._inRange(scene, scene._interOpenId)
    ) {
      Interactable._closeAll(scene);
    }

    // hidden under build mode too: E is not bound in the build context, and the build HUD
    // stands where the prompt does. A def without a prompt draws no pill — its target prompts
    // through its own UI (an NPC's dialogue panel).
    scene._interPromptText = Interactable._promptText(scene);
    scene._interPrompt.enabled =
      scene._interPromptText !== "" &&
      !Interactable.isOpen(scene) &&
      !BuildMode.active;

    if (scene._storeOpen && scene._storeDirty) {
      StorageUI.refresh(scene);
      scene._storeDirty = false;
    }
    if (scene._craftOpen && scene._craftDirty) {
      CraftingUI.refresh(scene); // refreshes the active panel (recipes OR the weapon-mod view)
      scene._craftDirty = false;
    }
    if (scene._mapOpen && scene._mapDirty) {
      WorldMapUI.refresh(scene); // re-lays the chart's nodes after a pick
      scene._mapDirty = false;
    }
    if (scene._tradeOpen && scene._tradeDirty) {
      TradeUI.refresh(scene);
      scene._tradeDirty = false;
    }
  },

  // ── Scene hooks (the scene's E dispatch: a window open → closeAll, else activate)
  /** run the pick's action — THE E press; a no-op with nothing picked */
  activate(scene) {
    Interactable._open(scene);
  },

  /** close any open station window */
  closeAll(scene) {
    Interactable._closeAll(scene);
  },

  /** is a station window open (storage / crafting / world map / trade) */
  isOpen(scene) {
    return (
      scene._storeOpen === true ||
      scene._craftOpen === true ||
      scene._mapOpen === true ||
      scene._tradeOpen === true
    );
  },

  /**
   * THE pick over every Interaction-carrying entity in range: the one under the cursor, else by
   * proximity — the highest def priority, then the nearest (a companion at your side, priority
   * -1, never shadows the station you stopped at). NPCs are candidates like any station (their
   * Interaction is ColonySpawn's).
   */
  _pick(scene) {
    const entities = scene.level.entities;
    const p = entities.get(scene.playerId, Position);
    if (p === undefined) {
      scene._interTarget = -1;
      scene._interKind = "";
      return;
    }
    const rSq = Interactable.RADIUS * Interactable.RADIUS;
    let nearest = -1;
    let nearestSq = rSq;
    let nearestPri = -Infinity;
    let mousePick = -1;
    let mouseSq = Infinity;

    entities.forEach([Interaction, Position], (id, it, pos) => {
      const dPlayer = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (dPlayer >= rSq) return; // out of interact range
      const def = InteractAction.get(it.kind);
      const pri =
        def !== undefined && def.priority !== undefined ? def.priority : 0;
      if (pri > nearestPri) {
        nearestPri = pri;
        nearestSq = dPlayer;
        nearest = id;
      } else if (pri === nearestPri && dPlayer < nearestSq) {
        nearestSq = dPlayer;
        nearest = id;
      }
      if (
        Interactable._mouseInside(pos, entities.get(id, BBox), scene.mouseWorld)
      ) {
        const dMouse =
          (pos.x - scene.mouseWorld.x) ** 2 + (pos.y - scene.mouseWorld.y) ** 2;
        if (dMouse < mouseSq) {
          mouseSq = dMouse;
          mousePick = id;
        }
      }
    });

    const target = mousePick !== -1 ? mousePick : nearest;
    scene._interTarget = target;
    if (target !== -1) {
      const comp = entities.get(target, Interaction);
      scene._interKind = comp !== undefined ? comp.kind : "";
    } else {
      scene._interKind = "";
    }
  },

  /**
   * true when the world cursor `m` ({x,y} — the scene's per-frame pitch-aware latch) is inside
   * the entity's world BBox (offset from Position)
   */
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
    const entities = scene.level.entities;
    const p = entities.get(scene.playerId, Position);
    const pos = entities.get(id, Position);
    if (p === undefined || pos === undefined) return false;
    const rSq = Interactable.RADIUS * Interactable.RADIUS;
    return (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2 < rSq;
  },

  /**
   * dispatch the target's Interaction via the registry: look up its `kind` and run the def. A window
   * action's run() sets scene._interOpenId itself (so this stays generic — instant vs window is the
   * def's concern, not the engine's). New interactions are a data entry in InteractAction, not here.
   */
  _open(scene) {
    const ctx = Interactable._ctx(scene);
    if (ctx.comp === undefined) return;
    const def = InteractAction.get(ctx.comp.kind);
    if (def === undefined) return;
    def.run(ctx);
  },

  _closeAll(scene) {
    if (scene._storeOpen) StorageUI.close(scene);
    if (scene._craftOpen) CraftingUI.close(scene);
    if (scene._mapOpen) WorldMapUI.close(scene);
    if (scene._tradeOpen) TradeUI.close(scene);
    scene._interOpenId = -1;
  },

  /**
   * world-space highlight outline around the target's BBox; called from scene.draw() after the world
   */
  drawTarget(scene) {
    const id = scene._interTarget;
    if (id === -1) return;
    const entities = scene.level.entities;
    const pos = entities.get(id, Position);
    const bbox = entities.get(id, BBox);
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

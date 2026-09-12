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
 * THE STATION PAGES: a window action's run() opens its page through the scene's Window with the
 * target entity (`scene.window.open("storage", { target: ctx.id })`); update() range-closes the
 * open page when that target leaves reach (or is gone) and hides the pill while any page shows.
 * The pages themselves, their refresh and their Esc are the Window's (see Window).
 */
globalThis.Interactable = {
  RADIUS: 72, // interact range (px); 32px-cell scale

  build(scene) {
    scene._interTarget = -1;
    scene._interKind = "";
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
   * Per-frame: pick target, drive prompt/highlight, range-close the open station page. E is NOT
   * read here — the scene reads it after this and closes the page or calls activate(), so the
   * press always lands on the pick this frame made.
   */
  update(scene) {
    Interactable._pick(scene);

    // the open page's target left range (or is gone) → close
    const target = scene.window.target;
    if (target !== -1) {
      if (!Interactable._inRange(scene, target)) scene.window.close();
    }

    // hidden under build mode too: E is not bound in the build context, and the build HUD
    // stands where the prompt does. A def without a prompt draws no pill — its target prompts
    // through its own UI (an NPC's dialogue panel).
    scene._interPromptText = Interactable._promptText(scene);
    scene._interPrompt.enabled =
      scene._interPromptText !== "" &&
      !scene.window.isOpen() &&
      !BuildMode.active;
  },

  // ── Scene hook (the scene's E dispatch: a station page open → close it, else activate)
  /** run the pick's action — THE E press; a no-op with nothing picked */
  activate(scene) {
    Interactable._open(scene);
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
    const pitch = scene.map.camera.pitch; // the cursor test reads the view, not the sim (Silhouette)
    let nearest = -1;
    let nearestSq = rSq;
    let nearestPri = -Infinity;
    let mousePick = -1;
    let mouseFront = -Infinity;

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
      // the cursor names the SHAPE THE PLAYER SEES — a standing body's silhouette, a flat
      // prop's footprint (Silhouette) — and among overlapping shapes the frontmost, which is
      // the one whose pixels the player actually clicked
      if (
        pos.y > mouseFront &&
        Silhouette.hit(entities, id, pos, scene.mouseWorld, pitch)
      ) {
        mouseFront = pos.y;
        mousePick = id;
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
   * action's run() opens its page through scene.window with the target itself (so this stays
   * generic — instant vs window is the def's concern, not the engine's). New interactions are a
   * data entry in InteractAction, not here.
   */
  _open(scene) {
    const ctx = Interactable._ctx(scene);
    if (ctx.comp === undefined) return;
    const def = InteractAction.get(ctx.comp.kind);
    if (def === undefined) return;
    def.run(ctx);
  },

  /**
   * world-space highlight outline around the target, called from scene.draw() after the world:
   * around the SILHOUETTE the pick named, in the very plane RenderBillboard stood the body up in
   * (so the box lands on the body, not at its feet), and around the footprint for a flat prop
   * that has no silhouette.
   */
  drawTarget(scene) {
    const id = scene._interTarget;
    if (id === -1) return;
    const entities = scene.level.entities;
    const pos = entities.get(id, Position);
    if (pos === undefined) return;
    const box = Silhouette.of(entities, id);
    draw_set_color(c_yellow);
    if (box !== undefined) {
      // an outline is an affordance, not geometry: the depth the standing passes wrote would
      // clip the far edges behind the very bodies it marks, so it draws over them (restore the
      // Game-wide default after — Game Create_0)
      gpu_set_ztestenable(false);
      const tall = RenderBillboard.tall(scene.map.camera.pitch);
      matrix_set(
        matrix_world,
        matrix_build(pos.x, pos.y, 0, -90, 0, 0, 1, 1, tall),
      );
      // silhouette height runs UP, the sprite's local y down — the box flips into the plane
      draw_rectangle(
        box.left - 4,
        -box.top - 4,
        box.right + 4,
        -box.bottom + 4,
        true,
      );
      matrix_set(matrix_world, matrix_build_identity());
      gpu_set_ztestenable(true);
    } else {
      const bbox = entities.get(id, BBox);
      if (bbox !== undefined && bbox.width > 0 && bbox.height > 0) {
        const left = pos.x + bbox.x;
        const top = pos.y + bbox.y;
        draw_rectangle(
          left - 4,
          top - 4,
          left + bbox.width + 4,
          top + bbox.height + 4,
          true,
        );
      }
    }
    draw_set_color(c_white);
  },
};

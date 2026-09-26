/**
 * Interaction engine for the colony scene.
 *
 * The one-pick invariant: everything E can act on carries `Interaction`, so there is exactly one
 * candidate set and one pick per frame, and the highlight, the prompt and the activation all
 * derive from it. Never add a second picker over another channel: once a press arbitrates between
 * two picks, what is highlighted and what E does can disagree.
 *
 * The action is data in the InteractAction registry, so this is generic dispatch, not a per-kind
 * switch. Activation is E; the mouse only chooses the target. build() returns the pick handle
 * holding the engine's whole per-frame state, which the scene hands back to every member. An open
 * station page closes when its target leaves reach.
 */
globalThis.Interactable = {
  RADIUS: 72, // px

  build(scene) {
    const pick = {
      el: null,
      target: -1,
      kind: "",
      text: "", // "" = no pill
    };

    const prompt = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 140,
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
      facetLabel(() => pick.text, {
        halign: fa_center,
        color: FacetTheme.text,
      }),
    );
    prompt.insertChild(pill);
    prompt.enabled = false;
    pick.el = prompt;
    scene.ui.insertChild(prompt);
    return pick;
  },

  /** "" for no pick, or a def that shows no prompt. */
  _promptText(scene, pick) {
    const def = InteractAction.get(pick.kind);
    if (def === undefined) return "";
    const key =
      typeof def.prompt === "function"
        ? def.prompt(Interactable._ctx(scene, pick))
        : def.prompt;
    return key === "" ? "" : I18n.text(key);
  },

  _ctx(scene, pick) {
    const entities = scene.level.entities;
    return {
      scene,
      entities,
      id: pick.target,
      comp: entities.get(pick.target, Interaction),
      playerId: scene.playerId,
    };
  },

  /**
   * E is not read here: the scene reads it afterwards, so the press always lands on the pick this
   * frame made.
   */
  update(scene, pick) {
    Interactable._choose(scene, pick);

    const target = scene.window.target;
    if (target !== -1) {
      if (!Interactable._inRange(scene, target)) scene.window.close();
    }

    // hidden under build mode too: E is not bound there, and its HUD stands where the prompt does.
    pick.text = Interactable._promptText(scene, pick);
    pick.el.enabled = pick.text !== "" && !scene.build.active;
  },

  /** A no-op with nothing picked. */
  activate(scene, pick) {
    Interactable._open(scene, pick);
  },

  /**
   * The entity under the cursor, else by proximity: the highest def priority, then the nearest,
   * so a low-priority companion at your side never shadows the station you stopped at.
   */
  _choose(scene, pick) {
    const entities = scene.level.entities;
    const p = entities.get(scene.playerId, Position);
    if (p === undefined) {
      pick.target = -1;
      pick.kind = "";
      return;
    }
    const rSq = Interactable.RADIUS * Interactable.RADIUS;
    const pitch = CameraSystem.view(scene.level).pitch; // the cursor tests what is drawn
    let nearest = -1;
    let nearestSq = rSq;
    let nearestPri = -Infinity;
    let mousePick = -1;
    let mouseFront = -Infinity;

    entities.forEach([Interaction, Position], (id, it, pos) => {
      const dPlayer = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (dPlayer >= rSq) return;
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
      // the cursor names the shape the player sees, and among overlapping shapes the frontmost —
      // the one whose pixels were clicked.
      if (
        pos.y > mouseFront &&
        Silhouette.hit(entities, id, pos, scene.mouseWorld, pitch)
      ) {
        mouseFront = pos.y;
        mousePick = id;
      }
    });

    const target = mousePick !== -1 ? mousePick : nearest;
    pick.target = target;
    if (target !== -1) {
      const comp = entities.get(target, Interaction);
      pick.kind = comp !== undefined ? comp.kind : "";
    } else {
      pick.kind = "";
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

  /** Instant vs window is the def's concern, not the engine's. */
  _open(scene, pick) {
    const ctx = Interactable._ctx(scene, pick);
    if (ctx.comp === undefined) return;
    const def = InteractAction.get(ctx.comp.kind);
    if (def === undefined) return;
    def.run(ctx);
  },

  /**
   * World-space outline: around a standing body's silhouette in the plane it stands in, else
   * around a flat prop's footprint.
   */
  drawTarget(scene, pick) {
    const id = pick.target;
    if (id === -1) return;
    const entities = scene.level.entities;
    const pos = entities.get(id, Position);
    if (pos === undefined) return;
    const box = Silhouette.of(entities, id);
    draw_set_color(c_yellow);
    if (box !== undefined) {
      // an affordance, not geometry: depth would clip its far edges behind the body it marks.
      gpu_set_ztestenable(false);
      const tall = RenderBillboard.tall(CameraSystem.view(scene.level).pitch);
      matrix_set(
        matrix_world,
        matrix_build(pos.x, pos.y, 0, -90, 0, 0, 1, 1, tall),
      );
      // silhouette height runs up, the plane's local y down.
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

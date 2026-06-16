// Crafting WINDOW for the RPG scene. A "workbench" station
// (Station {kind:"workbench"}) opens this — a scroll of the recipes registered for that
// station kind (Recipe.forStation). Each row shows the output and its inputs with
// have/need counts; clicking crafts it (CraftSystem.craft pulls inputs from and deposits
// the output into the player's bag). Insufficient materials → the row is greyed and the
// click no-ops.
//
// Manager-drawn UI on the GUI layer (Draw_75), built once and toggled. Selection +
// open/close are owned by the shared Interactable module. All per-open state lives on
// the SCENE (namespaced `_craft*`) so two scenes can't clobber each other and
// teardownScene cleans up.
//
// Scene contract: scene.world, scene.ctrl.id (player), scene.ui.
globalThis.CraftingUI = {
  build(scene) {
    scene._craftOpen = false;
    scene._craftDirty = false;
    scene._craftKind = "";

    const win = gemsWindow(I18n.textRef("CRAFT_TITLE"), {
      top: 80,
      width: 400,
      onClose: () => CraftingUI.close(scene),
    });
    win.enabled = false;
    const scroll = gemsScroll({ height: 300 });
    win.body.insertChild(scroll);
    scene._craftWin = win;
    scene._craftBody = scroll.scrollBody;
    scene.ui.insertChild(win);
  },

  open(scene, stationId) {
    const st = scene.world.get(Station, stationId);
    scene._craftKind = st !== undefined ? st.kind : "workbench";
    scene._craftOpen = true;
    scene._craftWin.enabled = true;
    scene._craftDirty = true;
  },

  close(scene) {
    scene._craftOpen = false;
    scene._craftWin.enabled = false;
  },

  // Repopulate the recipe list. Rebuilt fully on each craft so have/need counts and the
  // craftable state stay fresh.
  refresh(scene) {
    const body = scene._craftBody;
    const kids = [...body.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const recipes = Recipe.forStation(scene._craftKind);
    if (inv === undefined || recipes.length === 0) {
      const r = new UIElement({ width: "100%", height: 24 });
      r.insertChild(
        gemsLabel(I18n.textRef("CRAFT_EMPTY"), { color: GemsTheme.textDim }),
      );
      body.insertChild(r);
      return;
    }

    for (let i = 0; i < recipes.length; i++) {
      body.insertChild(CraftingUI._recipeRow(scene, inv, recipes[i]));
    }
  },

  _recipeRow(scene, inv, recipe) {
    const can = CraftSystem.canCraft(inv, recipe);
    const out = recipe.output;
    const outDef = Item.get(out.itemId);
    const outName = outDef !== undefined ? I18n.text(outDef.name) : out.itemId;
    const label =
      outName + " x" + out.qty + "   " + CraftingUI._inputsLabel(inv, recipe);
    const color = can
      ? RpgWorldOverlay._rarityColor(out.itemId)
      : GemsTheme.textDim;
    return gemsButton(
      label,
      () => {
        if (CraftSystem.craft(scene.world, scene.ctrl.id, recipe.id)) {
          scene._craftDirty = true;
          scene._invDirty = true; // keep the main inventory window in sync if open
        }
      },
      { height: 34, textColor: color },
    );
  },

  // "2/3 Wood, 0/1 Gel" — have/need per input.
  _inputsLabel(inv, recipe) {
    const parts = [];
    for (let i = 0; i < recipe.inputs.length; i++) {
      const inp = recipe.inputs[i];
      const have = InventorySystem.count(inv, inp.itemId);
      const def = Item.get(inp.itemId);
      const name = def !== undefined ? I18n.text(def.name) : inp.itemId;
      parts.push(have + "/" + inp.qty + " " + name);
    }
    return parts.join(", ");
  },
};

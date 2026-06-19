// Crafting WINDOW for the RPG scene. A "workbench" station (Station {kind:"workbench"})
// opens this — a master-detail panel over the recipes registered for that station kind
// (Recipe.forStation):
//   • LEFT  — a scrollable list of the craftable outputs; click one to select it (the
//             selected row is highlighted, uncraftable rows are dimmed).
//   • RIGHT — details for the selected recipe: output name, description, the ingredient
//             list with have/need counts (red when short), and a Craft button.
// The Craft button is disabled (live) while the ingredients aren't met; clicking it runs
// CraftSystem.craft (pulls inputs from / deposits the output into the player's bag).
//
// Manager-drawn UI on the GUI layer (Draw_75), built once and toggled. Selection +
// open/close are owned by the shared Interactable module. All per-open state lives on
// the SCENE (namespaced `_craft*`) so two scenes can't clobber each other and
// teardownScene cleans up. The list + detail are rebuilt on each refresh (selection
// change / craft), so have/need counts and the craftable state stay fresh.
//
// Scene contract: scene.world, scene.ctrl.id (player), scene.ui.
globalThis.CraftingUI = {
  WRAP: 320, // description wrap width (px) — fits the fixed-size detail column
  LIST_H: 500, // recipe-list / panel height (px) — fits ~12 rows without a scroll (see build)

  build(scene) {
    scene._craftOpen = false;
    scene._craftDirty = false;
    scene._craftKind = "";
    scene._craftSel = ""; // selected recipe id (defaulted to the first on refresh)

    const win = gemsWindow(I18n.textRef("CRAFT_TITLE"), {
      top: 80,
      width: 600,
      resizable: false, // a fixed master-detail panel (stable description wrap width)
      onClose: () => CraftingUI.close(scene),
    });
    win.enabled = false;

    const row = new UIElement({
      width: "100%",
      height: CraftingUI.LIST_H,
      flexShrink: 0,
      flexDirection: "row",
      gap: GemsTheme.gap,
    });

    // Left: the recipe picker. A PLAIN column, NOT a gemsScroll — clipping anywhere in this
    // master-detail row is unreliable on GMRT 0.20, with no clean escape (re-verified every way,
    // 2026-06). The root cause: a gpu_set_scissor clip submits the LAST-pending vertex primitive of
    // whatever drew just BEFORE it under its OWN (tighter) scissor — clipping that primitive away —
    // and a NON-clipped sibling drawn AFTER a clip-first sibling fails to render at all ("No
    // pipeline set" / "Invalid CommandBuffer"). Every clipped layout here just relocates the victim:
    //   • list-as-scroll on the left (clip drawn first) → the whole detail column renders nothing;
    //   • flexDirection row-reverse so the scroll draws LAST → detail renders, but the Craft
    //     button's label (detail's last pending primitive) is eaten by the scroll's scissor;
    //   • clipping the detail too → its Craft label is saved by the detail's own end-flush, but the
    //     window's close "x" (the prior pending primitive) is then eaten instead.
    // draw_flush() is NOT a fix: flushing right before a clip's gpu_set_scissor corrupts the clip
    // (blank content). So we avoid clipping here and size the column to fit instead: LIST_H holds
    // the current 12 recipes (row 32px + gapSm). Bump LIST_H if a station registers more.
    // (UITabs has the same "trailing label eaten by a following clip" issue and fixes it with a
    // harmless trailing untextured re-stroke — viable there because the eaten primitive is
    // redundant; here every candidate victim is load-bearing, so no-clip is the robust choice.)
    const left = new UIElement({
      width: 210,
      height: "100%",
      flexShrink: 0,
      gap: GemsTheme.gapSm,
    });
    scene._craftList = left;
    row.insertChild(left);

    // Right: the selected recipe's detail (repopulated by refresh).
    const detail = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      height: "100%",
      gap: GemsTheme.gapSm,
    });
    scene._craftDetail = detail;
    row.insertChild(detail);

    win.body.insertChild(row);
    scene._craftWin = win;
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

  // Rebuild both panels. Ensures a valid selection first (default to the first recipe, and
  // reset if the selected id isn't in this station's list — e.g. after a station change).
  refresh(scene) {
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const recipes = Recipe.forStation(scene._craftKind);
    if (recipes.length > 0 && !CraftingUI._hasRecipe(recipes, scene._craftSel))
      scene._craftSel = recipes[0].id;
    CraftingUI._fillList(scene, inv, recipes);
    CraftingUI._fillDetail(scene, inv, recipes);
  },

  _hasRecipe(recipes, id) {
    for (let i = 0; i < recipes.length; i++)
      if (recipes[i].id === id) return true;
    return false;
  },

  // Left panel: one selectable button per recipe (output name; dimmed when uncraftable).
  _fillList(scene, inv, recipes) {
    const body = scene._craftList;
    const kids = [...body.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    if (inv === undefined || recipes.length === 0) {
      body.insertChild(
        gemsLabel(I18n.textRef("CRAFT_EMPTY"), { color: GemsTheme.textDim }),
      );
      return;
    }
    for (let i = 0; i < recipes.length; i++) {
      body.insertChild(CraftingUI._listButton(scene, inv, recipes[i]));
    }
  },

  _listButton(scene, inv, recipe) {
    const id = recipe.id;
    const out = recipe.output;
    const def = Item.get(out.itemId);
    const name = def !== undefined ? I18n.text(def.name) : out.itemId;
    const can = CraftSystem.canCraft(inv, recipe);
    return gemsButton(
      name,
      () => {
        scene._craftSel = id;
        scene._craftDirty = true; // repopulate the detail next update
      },
      {
        height: 32,
        selected: () => scene._craftSel === id,
        textColor: can
          ? RpgWorldOverlay._rarityColor(out.itemId)
          : GemsTheme.textDim,
      },
    );
  },

  // Right panel: the selected recipe's name, description, ingredients, and Craft button.
  _fillDetail(scene, inv, recipes) {
    const host = scene._craftDetail;
    const kids = [...host.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    if (inv === undefined || recipes.length === 0) {
      host.insertChild(
        gemsLabel(I18n.textRef("CRAFT_SELECT"), { color: GemsTheme.textDim }),
      );
      return;
    }
    let recipe;
    for (let i = 0; i < recipes.length; i++)
      if (recipes[i].id === scene._craftSel) recipe = recipes[i];
    if (recipe === undefined) return;

    const out = recipe.output;
    const def = Item.get(out.itemId);
    const name = def !== undefined ? I18n.text(def.name) : out.itemId;

    host.insertChild(
      gemsLabel(name + " x" + out.qty, {
        font: "header",
        color: RpgWorldOverlay._rarityColor(out.itemId),
      }),
    );
    host.insertChild(gemsDivider());
    if (def !== undefined && def.description !== "") {
      host.insertChild(
        gemsLabel(I18n.textRef(def.description), {
          color: GemsTheme.textMuted,
          wrap: CraftingUI.WRAP,
        }),
      );
    }

    host.insertChild(
      gemsLabel(I18n.textRef("CRAFT_INGREDIENTS"), {
        color: GemsTheme.textMuted,
      }),
    );
    for (let i = 0; i < recipe.inputs.length; i++) {
      host.insertChild(CraftingUI._ingredientRow(inv, recipe.inputs[i]));
    }

    // Spacer pushes the Craft button to the bottom of the fixed-height detail column.
    host.insertChild(
      new UIElement({ width: "100%", flexGrow: 1, flexBasis: 0 }),
    );
    host.insertChild(
      gemsButton(
        I18n.textRef("CRAFT_DO"),
        () => {
          if (CraftSystem.craft(scene.world, scene.ctrl.id, recipe.id)) {
            scene._craftDirty = true;
            scene._invDirty = true; // keep the main inventory window in sync if open
          }
        },
        {
          primary: true,
          // Live gate: disabled while the ingredients aren't met (re-evaluated each frame
          // off the same Inventory object, which the craft mutates in place).
          disabled: () => !CraftSystem.canCraft(inv, recipe),
        },
      ),
    );
  },

  // One ingredient line: "Name   have/need", reddened when the player is short.
  _ingredientRow(inv, inp) {
    const have = InventorySystem.count(inv, inp.itemId);
    const def = Item.get(inp.itemId);
    const name = def !== undefined ? I18n.text(def.name) : inp.itemId;
    const ok = have >= inp.qty;
    const short = "#e06c6c";

    const row = new UIElement({
      width: "100%",
      height: 22,
      flexDirection: "row",
      alignItems: "center",
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    nameCell.insertChild(
      gemsLabel(name, { color: ok ? GemsTheme.text : short }),
    );
    row.insertChild(nameCell);
    row.insertChild(
      gemsLabel(have + "/" + inp.qty, {
        color: ok ? GemsTheme.textMuted : short,
      }),
    );
    return row;
  },
};

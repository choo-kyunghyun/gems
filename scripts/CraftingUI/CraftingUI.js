// WORKBENCH window. near-fullscreen shell (absolute host + dim backdrop + centered card, shown/
// hidden via `.enabled`, built once — same as TradeUI/RpgInventoryUI). one bench upgraded by a
// single MODULE slot (Station.module): slot a WorkbenchModule to change what it does. two parts:
//   • a MODULE BAR (top) — slotted module + Remove + an Install button per owned module. rebuilt each refresh.
//   • a CONTENT area swapped by the module's kind: CRAFT mode (empty / "recipes" module) = a recipe
//     master-detail filtered by Recipe.requires (base recipes always show); WEAPON-MOD mode (the
//     Toolkit, "weaponmod") = the WeaponModUI panel.
// the two content rows are SAME-SIZE, swapped STRUCTURALLY (insert/removeChild) on a mode change —
// `enabled` only gates update/draw, a disabled sibling still reserves its flex space (CLAUDE.md).
// both rows are PLAIN columns (no gpu_set_scissor clip — unreliable in a master-detail row on
// GMRT 0.20; was a long whack-a-mole); the content body flex-grows to fill the card.
// open/close owned by Interactable; state on scene (`_craft*`, plus `_mod*` for the weapon-mod panel).
globalThis.CraftingUI = {
  WRAP: 320, // description wrap width (px) — a stable narrow column within the detail pane

  build(scene) {
    scene._craftOpen = false;
    scene._craftDirty = false;
    scene._craftStationId = -1; // the open workbench entity (its Station holds the module slot)
    scene._craftSel = ""; // selected recipe id (defaulted to the first on refresh)
    scene._craftMode = ""; // "craft" | "mod" — which content row is currently mounted

    const margin = 28;
    // absolute dim backdrop host — fills the screen, veils the HUD behind it.
    const host = new UIElement({
      positionType: "absolute",
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      padding: margin,
      alignItems: "center",
    });
    host.addComponent(new UIPanel({ color: gemsColor("#000000"), alpha: 0.72 }));
    host.addComponent(new UITrigger({})); // swallow backdrop clicks
    scene._craftWin = host;
    scene._craftWin.enabled = false;
    scene.ui.insertChild(scene._craftWin);

    const inner = new UIElement({ width: "100%", maxWidth: 1100, height: "100%" });
    const card = gemsCard({
      width: "100%",
      flexGrow: 1,
      padding: GemsTheme.pad,
      gap: GemsTheme.gapSm,
    });

    // title + close (x); Esc / E also close (handleEscape / _dispatchInteract).
    const titleRow = new UIElement({
      width: "100%",
      height: 40,
      flexShrink: 0,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    });
    titleRow.insertChild(
      gemsLabel(I18n.textRef("CRAFT_TITLE"), {
        font: "header",
        color: GemsTheme.text,
      }),
    );
    titleRow.insertChild(
      gemsButton("x", () => CraftingUI.close(scene), {
        width: 32,
        height: 32,
        rad: GemsTheme.radiusSm,
      }),
    );
    card.insertChild(titleRow);
    card.insertChild(gemsDivider());

    // module slot bar (top), repopulated each refresh.
    const bar = new UIElement({
      width: "100%",
      flexShrink: 0,
      gap: GemsTheme.gapSm,
    });
    scene._craftModuleBar = bar;
    card.insertChild(bar);
    card.insertChild(gemsDivider());

    // content host: holds exactly one content row at a time (swapped structurally). grows to fill
    // the near-fullscreen card.
    const body = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
    });
    scene._craftBody = body;
    card.insertChild(body);

    // ── CRAFT row: left recipe list + right detail ──
    const craftRow = new UIElement({
      width: "100%",
      height: "100%",
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const left = new UIElement({
      width: 210,
      height: "100%",
      flexShrink: 0,
      gap: GemsTheme.gapSm,
    });
    scene._craftList = left;
    craftRow.insertChild(left);
    const detail = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      height: "100%",
      gap: GemsTheme.gapSm,
    });
    scene._craftDetail = detail;
    craftRow.insertChild(detail);
    scene._craftCraftRow = craftRow; // kept detached when mod mode is mounted

    // ── WEAPON-MOD row: left weapon list + right mod detail, filled by WeaponModUI ──
    const modRow = new UIElement({
      width: "100%",
      height: "100%",
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    const modLeft = new UIElement({
      width: 210,
      height: "100%",
      flexShrink: 0,
      gap: GemsTheme.gapSm,
    });
    modRow.insertChild(modLeft);
    const modDetail = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      height: "100%",
      gap: GemsTheme.gapSm,
    });
    modRow.insertChild(modDetail);
    scene._craftModRow = modRow;
    WeaponModUI.buildPanel(scene, modLeft, modDetail);

    // Mount craft mode by default.
    body.insertChild(craftRow);
    scene._craftMode = "craft";

    inner.insertChild(card);
    host.insertChild(inner);
  },

  open(scene, stationId) {
    scene._craftStationId = stationId;
    scene._craftOpen = true;
    scene._craftWin.enabled = true;
    scene._craftDirty = true;
  },

  close(scene) {
    scene._craftOpen = false;
    scene._craftWin.enabled = false;
  },

  // slotted module itemId of the open workbench ("" = empty).
  _module(scene) {
    const st = scene.world.get(Station, scene._craftStationId);
    return st !== undefined && st.module !== undefined ? st.module : "";
  },

  // content mode the module drives: "mod" for a weaponmod module, else "craft".
  _modeFor(module) {
    if (module === "") return "craft";
    const it = Item.get(module);
    const m = it !== undefined ? it.getComponent(WorkbenchModule) : undefined;
    return m !== undefined && m.kind === "weaponmod" ? "mod" : "craft";
  },

  // rebuild the module bar + active content panel; swaps the mounted row on a mode change.
  refresh(scene) {
    const module = CraftingUI._module(scene);
    const mode = CraftingUI._modeFor(module);

    if (mode !== scene._craftMode) {
      const cur =
        scene._craftMode === "mod" ? scene._craftModRow : scene._craftCraftRow;
      const next = mode === "mod" ? scene._craftModRow : scene._craftCraftRow;
      scene._craftBody.removeChild(cur);
      scene._craftBody.insertChild(next);
      scene._craftMode = mode;
    }

    CraftingUI._fillModuleBar(scene, module);

    if (mode === "mod") {
      WeaponModUI.refresh(scene);
      return;
    }
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const recipes = CraftingUI._visibleRecipes(module);
    if (recipes.length > 0 && !CraftingUI._hasRecipe(recipes, scene._craftSel))
      scene._craftSel = recipes[0].id;
    CraftingUI._fillList(scene, inv, recipes);
    CraftingUI._fillDetail(scene, inv, recipes, module);
  },

  // recipes whose module gate `module` meets: base recipes (no `requires`) + the slotted module's.
  _visibleRecipes(module) {
    const all = Recipe.forStation("workbench");
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const r = all[i];
      if (r.requires === undefined || r.requires === module) out.push(r);
    }
    return out;
  },

  _hasRecipe(recipes, id) {
    for (let i = 0; i < recipes.length; i++)
      if (recipes[i].id === id) return true;
    return false;
  },

  // Module bar: slotted module + Remove, then an Install button per owned module. rebuilt each refresh.
  _fillModuleBar(scene, module) {
    const bar = scene._craftModuleBar;
    const kids = [...bar.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    // line 1: "Module: <name>" + Remove (when slotted).
    const line1 = new UIElement({
      width: "100%",
      height: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    const installed = module !== "" ? Item.get(module) : undefined;
    const modName =
      installed !== undefined
        ? I18n.text(installed.name)
        : I18n.text("WB_SLOT_EMPTY");
    nameCell.insertChild(
      gemsLabel(I18n.text("WB_MODULE") + " " + modName, {
        color:
          module !== ""
            ? RpgWorldOverlay._rarityColor(module)
            : GemsTheme.textMuted,
      }),
    );
    line1.insertChild(nameCell);
    if (module !== "") {
      line1.insertChild(
        gemsButton(
          I18n.textRef("WB_REMOVE"),
          () => CraftingUI._removeModule(scene),
          { width: 90, height: 24 },
        ),
      );
    }
    bar.insertChild(line1);

    // line 2: an Install button per owned module (the slotted one isn't in the bag, so it can't appear).
    const owned = CraftingUI._ownedModules(scene);
    if (owned.length === 0) {
      if (module === "")
        bar.insertChild(
          gemsLabel(I18n.textRef("WB_NO_MODULES"), {
            color: GemsTheme.textDim,
          }),
        );
      return;
    }
    const line2 = new UIElement({
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    for (let i = 0; i < owned.length; i++) {
      const id = owned[i];
      const it = Item.get(id);
      const nm = it !== undefined ? I18n.text(it.name) : id;
      line2.insertChild(
        gemsButton(
          I18n.text("WB_INSTALL") + " " + nm,
          () => CraftingUI._installModule(scene, id),
          { height: 24, textColor: RpgWorldOverlay._rarityColor(id) },
        ),
      );
    }
    bar.insertChild(line2);
  },

  // distinct itemIds of owned WorkbenchModule items (in slot order).
  _ownedModules(scene) {
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    const out = [];
    const seen = {};
    if (inv === undefined) return out;
    for (let i = 0; i < inv.slots.length; i++) {
      const id = inv.slots[i].itemId;
      if (seen[id]) continue;
      const it = Item.get(id);
      if (it !== undefined && it.hasComponent(WorkbenchModule)) {
        seen[id] = true;
        out.push(id);
      }
    }
    return out;
  },

  // slot module `id`, returning the previously slotted one. order matters: free the incoming module's
  // bag slot FIRST so a full bag can still take the outgoing one; if it can't fit, undo + warn (never lost).
  _installModule(scene, id) {
    const st = scene.world.get(Station, scene._craftStationId);
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    if (st === undefined || inv === undefined) return;
    if (InventorySystem.remove(inv, id, 1) < 1) return; // didn't own it
    const prev = st.module;
    if (prev !== undefined && prev !== "") {
      if (InventorySystem.add(inv, prev, 1) !== 0) {
        InventorySystem.add(inv, id, 1); // bag full — undo the consume, keep the slot as-is
        Toast.push(I18n.text("WB_BAG_FULL"), { type: "warn" });
        return;
      }
    }
    st.module = id;
    scene._craftDirty = true;
    scene._invDirty = true;
    Log.info(`installed module ${id}`);
  },

  // pop the slotted module back into the bag (refused if the bag is full).
  _removeModule(scene) {
    const st = scene.world.get(Station, scene._craftStationId);
    const inv = scene.world.get(Inventory, scene.ctrl.id);
    if (st === undefined || inv === undefined) return;
    if (st.module === undefined || st.module === "") return;
    if (InventorySystem.add(inv, st.module, 1) !== 0) {
      Toast.push(I18n.text("WB_BAG_FULL"), { type: "warn" });
      return;
    }
    Log.info(`removed module ${st.module}`);
    st.module = "";
    scene._craftDirty = true;
    scene._invDirty = true;
  },

  // Craft panel — left: one selectable button per recipe (dimmed when uncraftable).
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
    // list is pre-filtered so the gate always holds — pass the recipe's own `requires` so canCraft
    // only checks ingredients.
    const can = CraftSystem.canCraft(inv, recipe, recipe.requires);
    return gemsButton(
      name,
      () => {
        scene._craftSel = id;
        scene._craftDirty = true; // repopulate the detail
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

  // Craft panel — right: selected recipe's name, description, ingredients, Craft button.
  _fillDetail(scene, inv, recipes, module) {
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
          if (
            CraftSystem.craft(scene.world, scene.ctrl.id, recipe.id, module)
          ) {
            scene._craftDirty = true;
            scene._invDirty = true; // keep the inventory window in sync
          }
        },
        {
          primary: true,
          // live gate: disabled while ingredients aren't met (re-evaluated each frame).
          disabled: () => !CraftSystem.canCraft(inv, recipe, module),
        },
      ),
    );
  },

  // ingredient line: "Name   have/need", reddened when short.
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

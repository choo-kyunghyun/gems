// WORKBENCH window for the RPG scene. A "workbench" station opens this. Instead of a station per
// category, ONE bench is upgraded by a single MODULE slot (Station.module): slot a WorkbenchModule
// item to change what the bench does. The window has two parts:
//   • A MODULE BAR (top) — the slotted module's name, a Remove button (returns it to the bag), and
//     an Install button per owned WorkbenchModule in the bag (installing swaps the slot). Rebuilt
//     each refresh.
//   • A CONTENT area that swaps by the slotted module's kind:
//       – CRAFT mode (empty slot or a "recipes" module): a master-detail recipe picker. The list is
//         filtered by Recipe.requires — base recipes (no `requires`) always show; a module's recipes
//         show only while it's slotted (CraftSystem also enforces the gate).
//       – WEAPON-MOD mode (the Toolkit, a "weaponmod" module): the WeaponModUI panel (install/remove
//         weapon mods), folding the old standalone Anvil into the bench.
// The two content rows are SAME-SIZE but different content, so they're swapped STRUCTURALLY (insert/
// removeChild) on a mode change — `enabled` only gates update/draw, a disabled sibling still reserves
// its flex space (CLAUDE.md). Both rows are PLAIN columns (no gpu_set_scissor clip — unreliable in a
// master-detail row on GMRT 0.20; see the long whack-a-mole note this comment used to hold), sized to
// fit via LIST_H.
//
// Manager-drawn UI on the GUI layer (Draw_75), built once and toggled. Selection + open/close are
// owned by the shared Interactable module. All per-open state lives on the SCENE (namespaced
// `_craft*`, plus `_mod*` for the weapon-mod panel). Scene contract: scene.world, scene.ctrl.id
// (player), scene.ui.
globalThis.CraftingUI = {
  WRAP: 320, // description wrap width (px) — fits the fixed-size detail column
  LIST_H: 480, // content height (px) — fits the max simultaneous recipe count (base + one module)

  build(scene) {
    scene._craftOpen = false;
    scene._craftDirty = false;
    scene._craftStationId = -1; // the open workbench entity (its Station holds the module slot)
    scene._craftSel = ""; // selected recipe id (defaulted to the first on refresh)
    scene._craftMode = ""; // "craft" | "mod" — which content row is currently mounted

    const win = gemsWindow(I18n.textRef("CRAFT_TITLE"), {
      top: 80,
      width: 600,
      resizable: false, // a fixed master-detail panel (stable description wrap width)
      onClose: () => CraftingUI.close(scene),
    });
    win.enabled = false;

    // Module slot bar (top), repopulated each refresh.
    const bar = new UIElement({
      width: "100%",
      flexShrink: 0,
      gap: GemsTheme.gapSm,
    });
    scene._craftModuleBar = bar;
    win.body.insertChild(bar);
    win.body.insertChild(gemsDivider());

    // Content host: holds exactly ONE of the two content rows at a time (swapped structurally).
    const body = new UIElement({
      width: "100%",
      height: CraftingUI.LIST_H,
      flexShrink: 0,
    });
    scene._craftBody = body;
    win.body.insertChild(body);

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

    scene._craftWin = win;
    scene.ui.insertChild(win);
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

  // The slotted module itemId of the open workbench ("" = empty).
  _module(scene) {
    const st = scene.world.get(Station, scene._craftStationId);
    return st !== undefined && st.module !== undefined ? st.module : "";
  },

  // The content mode the slotted module drives: "mod" for a weaponmod module, else "craft".
  _modeFor(module) {
    if (module === "") return "craft";
    const it = Item.get(module);
    const m = it !== undefined ? it.getComponent(WorkbenchModule) : undefined;
    return m !== undefined && m.kind === "weaponmod" ? "mod" : "craft";
  },

  // Rebuild the module bar + the active content panel. Swaps the mounted content row on a mode change.
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

  // Recipes whose module gate is met by `module`: base recipes (no `requires`) always, plus the
  // slotted module's recipes. All recipes are station "workbench" now (one bench, modules gate).
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

  // ── Module bar ─────────────────────────────────────────────────────────────
  // Top bar: the slotted module + Remove, then an Install button per owned module. Rebuilt each
  // refresh (the owned set changes as modules are slotted/crafted).
  _fillModuleBar(scene, module) {
    const bar = scene._craftModuleBar;
    const kids = [...bar.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    // Line 1: "Module: <name>" + Remove (when one is slotted).
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

    // Line 2: an Install button per owned module (the bench's slotted one isn't in the bag, so it
    // can't appear here). A hint when the slot is empty and none are owned.
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

  // Distinct itemIds of owned WorkbenchModule items (in slot order).
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

  // Slot module `id`: consume it from the bag, return the previously slotted one. Order matters — free
  // the incoming module's bag slot FIRST so a full bag can still take the outgoing one; if it somehow
  // can't fit, undo and warn (the module is never lost).
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

  // Pop the slotted module back into the bag (refused with a warning if the bag is full).
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

  // ── Craft panel ────────────────────────────────────────────────────────────
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
    // A base recipe's module gate is always met; a visible module recipe's gate is met too (the list
    // is pre-filtered), so canCraft here only differs on the ingredient check — pass the recipe's own
    // `requires` as the module so the gate trivially holds.
    const can = CraftSystem.canCraft(inv, recipe, recipe.requires);
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
            scene._invDirty = true; // keep the main inventory window in sync if open
          }
        },
        {
          primary: true,
          // Live gate: disabled while the ingredients aren't met (re-evaluated each frame off the
          // same Inventory object the craft mutates in place). `module` satisfies the recipe's gate.
          disabled: () => !CraftSystem.canCraft(inv, recipe, module),
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

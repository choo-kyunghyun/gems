// WORKBENCH window: near-fullscreen shell (absolute host + dim backdrop + centered card, built once,
// shown via `.enabled` — like TradeUI/RpgInventoryUI). Open/close owned by Interactable.
/**
 * One bench upgraded by a single MODULE slot (Interaction.module): slot a WorkbenchModule to change
 * what it does. Two parts:
 *   • a MODULE BAR (top) — slotted module + Remove + an Install button per owned module. rebuilt each refresh.
 *   • a CONTENT area swapped by the module's kind: CRAFT mode (empty / "recipes" module) = a recipe
 *     master-detail filtered by Recipe.requires (base recipes always show); WEAPON-MOD mode (the
 *     Toolkit, "weaponmod") = the WeaponModUI panel.
 * The two content rows are SAME-SIZE, swapped STRUCTURALLY (insert/removeChild) on a mode change —
 * `enabled` only gates update/draw, a disabled sibling still reserves its flex space (CLAUDE.md).
 * Both rows are PLAIN columns (no gpu_set_scissor clip — unreliable in a master-detail row on
 * GMRT 0.20); the content body flex-grows to fill the card. State on the level (`_craft*`, plus
 * `_mod*` for the weapon-mod panel).
 */
globalThis.CraftingUI = {
  WRAP: 320, // description wrap width (px) — a stable narrow column within the detail pane

  build(level) {
    level._craftOpen = false;
    level._craftDirty = false;
    level._craftStationId = -1; // the open workbench entity (its Interaction holds the module slot)
    level._craftSel = ""; // selected recipe id (defaulted to the first on refresh)
    level._craftMode = ""; // "craft" | "mod" — which content row is currently mounted

    // near-fullscreen shell (dim host + centered card + title/close) — gemsOverlay.
    // Esc / E also close (handleEscape / _dispatchInteract).
    const host = gemsOverlay(I18n.textRef("CRAFT_TITLE"), {
      onClose: () => CraftingUI.close(level),
    });
    level._craftWin = host;
    level.ui.insertChild(host);
    const card = host.body;

    // module slot bar (top), repopulated each refresh.
    const bar = new UIElement({
      width: "100%",
      flexShrink: 0,
      gap: GemsTheme.gapSm,
    });
    level._craftModuleBar = bar;
    card.insertChild(bar);
    card.insertChild(gemsDivider());

    // content host: holds exactly one content row at a time (swapped structurally). grows to fill
    // the near-fullscreen card.
    const body = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
    });
    level._craftBody = body;
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
    level._craftList = left;
    craftRow.insertChild(left);
    const detail = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      height: "100%",
      gap: GemsTheme.gapSm,
    });
    level._craftDetail = detail;
    craftRow.insertChild(detail);
    level._craftCraftRow = craftRow; // kept detached when mod mode is mounted

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
    level._craftModRow = modRow;
    WeaponModUI.buildPanel(level, modLeft, modDetail);

    // Mount craft mode by default.
    body.insertChild(craftRow);
    level._craftMode = "craft";
  },

  open(level, stationId) {
    level._craftStationId = stationId;
    level._craftOpen = true;
    level._craftWin.enabled = true;
    level._craftDirty = true;
  },

  close(level) {
    level._craftOpen = false;
    level._craftWin.enabled = false;
  },

  // slotted module itemId of the open workbench ("" = empty).
  _module(level) {
    const st = level.entities.get(Interaction, level._craftStationId);
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
  refresh(level) {
    const module = CraftingUI._module(level);
    const mode = CraftingUI._modeFor(module);

    if (mode !== level._craftMode) {
      const cur =
        level._craftMode === "mod" ? level._craftModRow : level._craftCraftRow;
      const next = mode === "mod" ? level._craftModRow : level._craftCraftRow;
      level._craftBody.removeChild(cur);
      level._craftBody.insertChild(next);
      level._craftMode = mode;
    }

    CraftingUI._fillModuleBar(level, module);

    if (mode === "mod") {
      WeaponModUI.refresh(level);
      return;
    }
    const inv = level.entities.get(Inventory, level.playerId);
    const recipes = CraftingUI._visibleRecipes(module);
    if (recipes.length > 0 && !CraftingUI._hasRecipe(recipes, level._craftSel))
      level._craftSel = recipes[0].id;
    CraftingUI._fillList(level, inv, recipes);
    CraftingUI._fillDetail(level, inv, recipes, module);
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
  _fillModuleBar(level, module) {
    const bar = level._craftModuleBar;
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
          module !== "" ? InvTable.rarityColor(module) : GemsTheme.textMuted,
      }),
    );
    line1.insertChild(nameCell);
    if (module !== "") {
      line1.insertChild(
        gemsButton(
          I18n.textRef("WB_REMOVE"),
          () => CraftingUI._removeModule(level),
          { width: 90, height: 24 },
        ),
      );
    }
    bar.insertChild(line1);

    // line 2: an Install button per owned module (the slotted one isn't in the bag, so it can't appear).
    const owned = CraftingUI._ownedModules(level);
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
          () => CraftingUI._installModule(level, id),
          { height: 24, textColor: InvTable.rarityColor(id) },
        ),
      );
    }
    bar.insertChild(line2);
  },

  // distinct itemIds of owned WorkbenchModule items (in slot order).
  _ownedModules(level) {
    const inv = level.entities.get(Inventory, level.playerId);
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
  _installModule(level, id) {
    const st = level.entities.get(Interaction, level._craftStationId);
    const inv = level.entities.get(Inventory, level.playerId);
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
    level._craftDirty = true;
    level._invDirty = true;
    Log.info(`installed module ${id}`);
  },

  // pop the slotted module back into the bag (refused if the bag is full).
  _removeModule(level) {
    const st = level.entities.get(Interaction, level._craftStationId);
    const inv = level.entities.get(Inventory, level.playerId);
    if (st === undefined || inv === undefined) return;
    if (st.module === undefined || st.module === "") return;
    if (InventorySystem.add(inv, st.module, 1) !== 0) {
      Toast.push(I18n.text("WB_BAG_FULL"), { type: "warn" });
      return;
    }
    Log.info(`removed module ${st.module}`);
    st.module = "";
    level._craftDirty = true;
    level._invDirty = true;
  },

  // Craft panel — left: one selectable button per recipe (dimmed when uncraftable),
  // refilled via the shared gemsFillList.
  _fillList(level, inv, recipes) {
    const entries = [];
    if (inv !== undefined) {
      for (let i = 0; i < recipes.length; i++) {
        const recipe = recipes[i];
        const id = recipe.id;
        const out = recipe.output;
        const def = Item.get(out.itemId);
        // list is pre-filtered so the gate always holds — pass the recipe's own `requires`
        // so canCraft only checks ingredients.
        const can = CraftSystem.canCraft(inv, recipe, recipe.requires);
        entries.push({
          label: def !== undefined ? I18n.text(def.name) : out.itemId,
          onPick: () => {
            level._craftSel = id;
            level._craftDirty = true; // repopulate the detail
          },
          selected: () => level._craftSel === id,
          textColor: can ? InvTable.rarityColor(out.itemId) : GemsTheme.textDim,
        });
      }
    }
    gemsFillList(level._craftList, entries, I18n.textRef("CRAFT_EMPTY"));
  },

  // Craft panel — right: selected recipe's name, description, ingredients, Craft button.
  _fillDetail(level, inv, recipes, module) {
    const host = level._craftDetail;
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
      if (recipes[i].id === level._craftSel) recipe = recipes[i];
    if (recipe === undefined) return;

    const out = recipe.output;
    const def = Item.get(out.itemId);
    const name = def !== undefined ? I18n.text(def.name) : out.itemId;

    host.insertChild(
      gemsLabel(name + " x" + out.qty, {
        font: "header",
        color: InvTable.rarityColor(out.itemId),
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
            CraftSystem.craft(level.entities, level.playerId, recipe.id, module)
          ) {
            level._craftDirty = true;
            level._invDirty = true; // keep the inventory window in sync
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

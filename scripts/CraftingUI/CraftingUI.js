/**
 * Workbench page of the scene's Window.
 *
 * The bench is upgraded by a single module slot: the slotted module's kind picks the content —
 * crafting its gated recipes (base recipes always show) or weapon modding. The two content rows
 * are swapped structurally on a mode change, because a disabled sibling still reserves its flex
 * space.
 */
globalThis.CraftingUI = {
  WRAP: 320, // description wrap width (px)

  /** Build the page once. */
  build(scene) {
    const page = {
      title: I18n.textRef("CRAFT_TITLE"),
      el: new UIElement({
        width: "100%",
        flexGrow: 1,
        flexBasis: 0,
        gap: FacetTheme.gapSm,
      }),
      sel: "", // recipe id
      mode: "", // "craft" | "mod" — the mounted content row
      moduleBar: null,
      body: null,
      list: null,
      detail: null,
      craftRow: null,
      modRow: null,
      mod: null, // the weapon-mod panel's state
      refresh: () => CraftingUI.refresh(scene, page),
    };
    const card = page.el;

    const bar = new UIElement({
      width: "100%",
      flexShrink: 0,
      gap: FacetTheme.gapSm,
    });
    page.moduleBar = bar;
    card.insertChild(bar);
    card.insertChild(facetDivider());

    // holds exactly one content row at a time
    const body = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
    });
    page.body = body;
    card.insertChild(body);

    const craftRow = facetListDetail();
    page.list = craftRow.list;
    page.detail = craftRow.detail;
    page.craftRow = craftRow; // kept detached while mod mode is mounted

    const modRow = facetListDetail();
    page.modRow = modRow;
    page.mod = WeaponModUI.buildPanel(modRow.list, modRow.detail);

    body.insertChild(craftRow);
    page.mode = "craft";
    return page;
  },

  /** The open workbench's slotted module itemId ("" = empty). */
  _module(scene) {
    const st = scene.level.entities.get(scene.window.target, Interaction);
    return st !== undefined && st.module !== undefined ? st.module : "";
  },

  _modeFor(module) {
    if (module === "") return "craft";
    const it = Item.get(module);
    const m = it !== undefined ? it.getComponent(WorkbenchModule) : undefined;
    return m !== undefined && m.kind === "weaponmod" ? "mod" : "craft";
  },

  refresh(scene, page) {
    const module = CraftingUI._module(scene);
    const mode = CraftingUI._modeFor(module);

    if (mode !== page.mode) {
      const cur = page.mode === "mod" ? page.modRow : page.craftRow;
      const next = mode === "mod" ? page.modRow : page.craftRow;
      page.body.removeChild(cur);
      page.body.insertChild(next);
      page.mode = mode;
    }

    CraftingUI._fillModuleBar(scene, page, module);

    if (mode === "mod") {
      WeaponModUI.refresh(scene, page.mod);
      return;
    }
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    const recipes = CraftingUI._visibleRecipes(module);
    if (recipes.length > 0 && !CraftingUI._hasRecipe(recipes, page.sel))
      page.sel = recipes[0].id;
    CraftingUI._fillList(scene, page, inv, recipes);
    CraftingUI._fillDetail(scene, page, inv, recipes, module);
  },

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

  _fillModuleBar(scene, page, module) {
    const bar = page.moduleBar;
    facetClear(bar);

    const line1 = new UIElement({
      width: "100%",
      height: 28,
      flexDirection: "row",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    const nameCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    const installed = module !== "" ? Item.get(module) : undefined;
    const modName =
      installed !== undefined
        ? I18n.text(installed.name)
        : I18n.text("COMMON_EMPTY");
    nameCell.insertChild(
      facetLabel(I18n.text("CRAFT_MODULE") + " " + modName, {
        color:
          module !== "" ? InvTable.rarityColor(module) : FacetTheme.textMuted,
      }),
    );
    line1.insertChild(nameCell);
    if (module !== "") {
      line1.insertChild(
        facetButton(
          I18n.textRef("COMMON_REMOVE"),
          () => CraftingUI._removeModule(scene),
          { width: 90, height: 24 },
        ),
      );
    }
    bar.insertChild(line1);

    // the slotted module isn't in the bag, so it gets no Install button
    const owned = CraftingUI._ownedModules(scene);
    if (owned.length === 0) {
      if (module === "")
        bar.insertChild(
          facetLabel(I18n.textRef("CRAFT_NO_MODULES"), {
            color: FacetTheme.textDim,
          }),
        );
      return;
    }
    const line2 = new UIElement({
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: FacetTheme.gapSm,
    });
    for (let i = 0; i < owned.length; i++) {
      const id = owned[i];
      const it = Item.get(id);
      const nm = it !== undefined ? I18n.text(it.name) : id;
      line2.insertChild(
        facetButton(
          I18n.text("COMMON_INSTALL") + " " + nm,
          () => CraftingUI._installModule(scene, id),
          { height: 24, textColor: InvTable.rarityColor(id) },
        ),
      );
    }
    bar.insertChild(line2);
  },

  /** Distinct owned module itemIds, in slot order. */
  _ownedModules(scene) {
    const inv = scene.level.entities.get(scene.playerId, Inventory);
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

  /**
   * Slot module `id`, returning the previous one to the bag. The incoming module's bag slot is
   * freed first so a full bag can still take the outgoing one; if it can't, the swap is undone.
   */
  _installModule(scene, id) {
    const st = scene.level.entities.get(scene.window.target, Interaction);
    const inv = scene.level.entities.require(scene.playerId, Inventory);
    if (st === undefined) return;
    if (Bag.remove(inv, id, 1) < 1) return;
    const prev = st.module;
    if (prev !== undefined && prev !== "") {
      if (Bag.add(inv, prev, 1) !== 0) {
        Bag.add(inv, id, 1);
        Toast.push(I18n.text("INV_FULL"), { type: "warn" });
        return;
      }
    }
    st.module = id;
    scene.window.dirty = true;
    Log.info(`installed module ${id}`);
  },

  /** Refused when the bag is full. */
  _removeModule(scene) {
    const st = scene.level.entities.get(scene.window.target, Interaction);
    const inv = scene.level.entities.require(scene.playerId, Inventory);
    if (st === undefined) return;
    if (st.module === undefined || st.module === "") return;
    if (Bag.add(inv, st.module, 1) !== 0) {
      Toast.push(I18n.text("INV_FULL"), { type: "warn" });
      return;
    }
    Log.info(`removed module ${st.module}`);
    st.module = "";
    scene.window.dirty = true;
  },

  /** One selectable entry per recipe, dimmed when uncraftable. */
  _fillList(scene, page, inv, recipes) {
    const entries = [];
    if (inv !== undefined) {
      for (let i = 0; i < recipes.length; i++) {
        const recipe = recipes[i];
        const id = recipe.id;
        const out = recipe.output;
        const def = Item.get(out.itemId);
        // the list is pre-filtered, so only the ingredients are checked
        const can = Crafting.canCraft(inv, recipe, recipe.requires);
        entries.push({
          label: def !== undefined ? I18n.text(def.name) : out.itemId,
          onPick: () => {
            page.sel = id;
            scene.window.dirty = true;
          },
          selected: () => page.sel === id,
          textColor: can
            ? InvTable.rarityColor(out.itemId)
            : FacetTheme.textDim,
        });
      }
    }
    facetFillList(page.list, entries, I18n.textRef("CRAFT_EMPTY"));
  },

  _fillDetail(scene, page, inv, recipes, module) {
    const host = page.detail;
    facetClear(host);

    if (inv === undefined || recipes.length === 0) {
      host.insertChild(
        facetLabel(I18n.textRef("CRAFT_SELECT"), { color: FacetTheme.textDim }),
      );
      return;
    }
    let recipe;
    for (let i = 0; i < recipes.length; i++)
      if (recipes[i].id === page.sel) recipe = recipes[i];
    if (recipe === undefined) return;

    const out = recipe.output;
    const def = Item.get(out.itemId);
    const name = def !== undefined ? I18n.text(def.name) : out.itemId;

    host.insertChild(
      facetLabel(name + " x" + out.qty, {
        font: "header",
        color: InvTable.rarityColor(out.itemId),
      }),
    );
    host.insertChild(facetDivider());
    if (def !== undefined && def.description !== "") {
      host.insertChild(
        facetLabel(I18n.textRef(def.description), {
          color: FacetTheme.textMuted,
          wrap: CraftingUI.WRAP,
        }),
      );
    }

    host.insertChild(
      facetLabel(I18n.textRef("CRAFT_INGREDIENTS"), {
        color: FacetTheme.textMuted,
      }),
    );
    for (let i = 0; i < recipe.inputs.length; i++) {
      host.insertChild(CraftingUI._ingredientRow(inv, recipe.inputs[i]));
    }

    // spacer pushes the Craft button to the bottom of the column
    host.insertChild(
      new UIElement({ width: "100%", flexGrow: 1, flexBasis: 0 }),
    );
    host.insertChild(
      facetButton(
        I18n.textRef("CRAFT_DO"),
        () => {
          if (
            Crafting.craft(
              scene.level.entities,
              scene.playerId,
              recipe.id,
              module,
            )
          )
            scene.window.dirty = true;
        },
        {
          primary: true,
          disabled: () => !Crafting.canCraft(inv, recipe, module),
        },
      ),
    );
  },

  _ingredientRow(inv, inp) {
    const have = Bag.count(inv, inp.itemId);
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
      facetLabel(name, { color: ok ? FacetTheme.text : short }),
    );
    row.insertChild(nameCell);
    row.insertChild(
      facetLabel(have + "/" + inp.qty, {
        color: ok ? FacetTheme.textMuted : short,
      }),
    );
    return row;
  },
};

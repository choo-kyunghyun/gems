/**
 * Workbench page of the scene's Window: the recipes the open bench's tags offer.
 */
globalThis.CraftingUI = {
  WRAP: 320, // description wrap width (px)

  /** Build the page once. */
  build(scene) {
    const page = {
      title: () => {
        const st = scene.level.entities.get(scene.window.target, Interaction);
        return I18n.text(
          st !== undefined && st.title !== undefined ? st.title : "CRAFT_TITLE",
        );
      },
      el: new UIElement({
        width: "100%",
        flexGrow: 1,
        flexBasis: 0,
      }),
      sel: "", // recipe id
      list: null,
      detail: null,
      refresh: () => CraftingUI.refresh(scene, page),
    };
    const row = facetListDetail();
    page.list = row.list;
    page.detail = row.detail;
    page.el.insertChild(row);
    return page;
  },

  /** The open bench's workbench tags. */
  _tags(scene) {
    const st = scene.level.entities.get(scene.window.target, Interaction);
    return st !== undefined && st.tags !== undefined ? st.tags : [];
  },

  refresh(scene, page) {
    const tags = CraftingUI._tags(scene);
    const inv = scene.level.entities.get(scene.playerId, Inventory);
    const recipes = Recipe.forTags(tags);
    if (recipes.length > 0 && !CraftingUI._hasRecipe(recipes, page.sel))
      page.sel = recipes[0].id;
    CraftingUI._fillList(scene, page, inv, recipes, tags);
    CraftingUI._fillDetail(scene, page, inv, recipes, tags);
  },

  _hasRecipe(recipes, id) {
    for (let i = 0; i < recipes.length; i++)
      if (recipes[i].id === id) return true;
    return false;
  },

  /** One selectable entry per recipe, dimmed when uncraftable. */
  _fillList(scene, page, inv, recipes, tags) {
    const entries = [];
    if (inv !== undefined) {
      for (let i = 0; i < recipes.length; i++) {
        const recipe = recipes[i];
        const id = recipe.id;
        const out = recipe.output;
        const def = Item.get(out.itemId);
        const can = Crafting.canCraft(inv, recipe, tags);
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

  _fillDetail(scene, page, inv, recipes, tags) {
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
              tags,
            )
          )
            scene.window.dirty = true;
        },
        {
          primary: true,
          disabled: () => !Crafting.canCraft(inv, recipe, tags),
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

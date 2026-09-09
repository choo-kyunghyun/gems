// The world map page of the scene's Window — the colony's site picker, opened from a travel
// beacon (the "travel" InteractAction: `scene.window.open("travel", { target })`, the beacon
// being what Interactable range-closes on).
/**
 * A schematic chart: every contentSites site as a node placed at its chart-space `pos` over a dark
 * panel, the routes fanning out from the home site drawn under the nodes, and a brief for the
 * selected site beside it — terrain, size, threat, and the trip's hours from where the squad
 * stands. Travel hands the pick to ColonyMap.travel behind a SceneTransition cover.
 *
 * The nodes are REBUILT on every open and on every pick (a handful of buttons), so the "you are
 * here" mark and the selection colors follow the live map with no per-frame color swaps; a pick
 * only sets scene.window.dirty, and the rebuild runs from Window.update — never inside the click
 * that would be destroying the button mid-traversal. State on the page: sel (the selected site
 * id), nodes (site id -> node element, read by the routes pass), chart.
 */
globalThis.WorldMapUI = {
  NODE_W: 150, // node button size (chart px at the design resolution)
  NODE_H: 36,

  /** build the page once; the scene adds it to its Window under "travel" */
  build(scene) {
    const page = {
      title: I18n.textRef("WORLDMAP_TITLE"),
      el: new UIElement({
        width: "100%",
        flexGrow: 1,
        flexBasis: 0,
        gap: FacetTheme.gapSm,
      }),
      sel: "", // selected site id
      nodes: {}, // site id -> node element (the routes pass reads their centers)
      chart: null,
      refresh: () => WorldMapUI.refresh(scene, page),
      onOpen: () => {
        page.sel = scene.level.id; // open on the current site
      },
    };

    const row = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: "row",
      gap: FacetTheme.gap,
    });
    // the chart: the nodes hang off it by percentage position (refilled per open — see refresh)
    const chart = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      height: "100%",
    });
    chart.addComponent(
      new UIPanel({
        color: facetColor(FacetTheme.panelLo),
        rad: FacetTheme.radiusSm,
        border: 1,
        borderColor: facetColor(FacetTheme.border),
      }),
    );
    chart.addComponent(WorldMapUI._routes(scene, page)); // under the nodes (components draw first)
    page.chart = chart;
    row.insertChild(chart);
    row.insertChild(WorldMapUI._brief(scene, page));
    page.el.insertChild(row);

    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      facetLabel(I18n.textRef("WORLDMAP_HINT"), {
        color: FacetTheme.textMuted,
      }),
    );
    page.el.insertChild(hint);
    return page;
  },

  /**
   * Rebuild the chart's nodes: one button per site at its chart position, colored by role —
   * the current site accent (primary), the selected one outlined gold, the rest plain — with the
   * "you are here" tag under the current one.
   */
  refresh(scene, page) {
    const chart = page.chart;
    while (chart.children.length > 0) chart.children[0].destroy(); // destroy() unlinks from the parent
    page.nodes = {};
    const sites = contentSites.SITES;
    const w = WorldMapUI.NODE_W;
    const h = WorldMapUI.NODE_H;
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      if (s.dev === true && !DEV_MODE) continue; // an authoring site — off the chart in release
      const here = s.id === scene.level.id;
      const picked = s.id === page.sel;
      // a zero-size anchor at the site's chart position; the node holder hangs centered on it
      // (a facetButton takes no position style of its own)
      const anchor = new UIElement({
        positionType: "absolute",
        left: Math.round(s.pos.x * 100) + "%",
        top: Math.round(s.pos.y * 100) + "%",
        width: 0,
        height: 0,
      });
      const holder = new UIElement({
        positionType: "absolute",
        left: -w / 2,
        top: -h / 2,
        width: w,
        height: h,
      });
      const opts = { width: "100%", height: h };
      if (here) opts.primary = true;
      else if (picked) {
        opts.color = FacetTheme.btnHover;
        opts.borderColor = FacetTheme.warn;
      }
      holder.insertChild(
        facetButton(
          I18n.textRef(s.name),
          () => {
            page.sel = s.id;
            scene.window.dirty = true;
          },
          opts,
        ),
      );
      anchor.insertChild(holder);
      if (here) {
        const tag = new UIElement({
          positionType: "absolute",
          left: -w / 2,
          top: h / 2 + 4,
          width: w,
          alignItems: "center",
        });
        tag.insertChild(
          facetLabel(I18n.textRef("WORLDMAP_HERE"), {
            font: "description",
            color: FacetTheme.accent,
          }),
        );
        anchor.insertChild(tag);
      }
      chart.insertChild(anchor);
      page.nodes[s.id] = holder;
    }
  },

  /**
   * The route lines, a UIComponent on the chart: home → every other site in the border color, and
   * the trip on the table (current → selected) over it in accent. Reads node centers live off
   * their layout, so a resize or a rebuild needs no bookkeeping.
   */
  _routes(scene, page) {
    return {
      onDraw(_el) {
        const nodes = page.nodes;
        const home = nodes[ColonyLevel.START];
        if (home === undefined) return;
        const hc = WorldMapUI._center(home);
        const alpha = draw_get_alpha();
        const ids = Object.keys(nodes);
        for (let i = 0; i < ids.length; i++) {
          if (ids[i] === ColonyLevel.START) continue;
          const c = WorldMapUI._center(nodes[ids[i]]);
          draw_line_width_color(
            hc.x,
            hc.y,
            c.x,
            c.y,
            2,
            facetColor(FacetTheme.border),
            facetColor(FacetTheme.border),
          );
        }
        const cur = nodes[scene.level.id];
        const sel = nodes[page.sel];
        if (cur !== undefined && sel !== undefined && cur !== sel) {
          const a = WorldMapUI._center(cur);
          const b = WorldMapUI._center(sel);
          draw_line_width_color(
            a.x,
            a.y,
            b.x,
            b.y,
            3,
            facetColor(FacetTheme.accent),
            facetColor(FacetTheme.accent),
          );
        }
        draw_set_alpha(alpha);
        draw_set_color(c_white);
      },
    };
  },

  _center(el) {
    const p = el.getLayoutPosition();
    return { x: p.left + p.width / 2, y: p.top + p.height / 2 };
  },

  /**
   * The brief column: the selected site's name + description, its readouts (live labels off
   * page.sel), and the Travel button (disabled on the site the squad already stands in).
   */
  _brief(scene, page) {
    const col = new UIElement({
      width: 340,
      height: "100%",
      gap: FacetTheme.gapSm,
    });
    col.insertChild(
      facetLabel(() => WorldMapUI._siteText(page, "name"), {
        font: "header",
        color: FacetTheme.text,
      }),
    );
    col.insertChild(
      facetLabel(() => WorldMapUI._siteText(page, "desc"), {
        color: FacetTheme.textMuted,
        wrap: 320,
      }),
    );
    col.insertChild(facetDivider());
    col.insertChild(
      facetKeyValueRow(I18n.textRef("WORLDMAP_TERRAIN"), () =>
        WorldMapUI._terrainText(page),
      ),
    );
    col.insertChild(
      facetKeyValueRow(I18n.textRef("WORLDMAP_SIZE"), () =>
        WorldMapUI._sizeText(page),
      ),
    );
    col.insertChild(
      facetKeyValueRow(I18n.textRef("WORLDMAP_THREAT"), () =>
        WorldMapUI._threatText(page),
      ),
    );
    col.insertChild(
      facetKeyValueRow(I18n.textRef("WORLDMAP_TRIP"), () =>
        WorldMapUI._tripText(scene, page),
      ),
    );
    col.insertChild(new UIElement({ flexGrow: 1 })); // push the button to the bottom
    col.insertChild(
      facetButton(
        I18n.textRef("WORLDMAP_TRAVEL"),
        () => WorldMapUI.travel(scene, page),
        {
          primary: true,
          disabled: () => page.sel === scene.level.id,
        },
      ),
    );
    return col;
  },

  _siteText(page, key) {
    const s = contentSites.get(page.sel);
    return s === undefined ? "" : I18n.text(s[key]);
  },

  /** the site's biome name */
  _terrainText(page) {
    const s = contentSites.get(page.sel);
    if (s === undefined) return "";
    const biome = contentBiomes.BIOMES[s.biome];
    return biome === undefined ? "" : I18n.text(biome.name);
  },

  /** a resident site's grid, else its def size */
  _sizeText(page) {
    const s = contentSites.get(page.sel);
    if (s === undefined) return "";
    const lv = World.get(s.id);
    if (lv !== null && lv.grid !== null)
      return I18n.text("WORLDMAP_SIZE_VAL", lv.grid.cols, lv.grid.rows);
    return I18n.text("WORLDMAP_SIZE_VAL", s.cols, s.rows);
  },

  _threatText(page) {
    const s = contentSites.get(page.sel);
    return s === undefined ? "" : I18n.text("THREAT_" + s.danger);
  },

  _tripText(scene, page) {
    if (page.sel === scene.level.id) return "-";
    return I18n.text(
      "WORLDMAP_TRIP_VAL",
      ColonyMap.travelHours(scene.level.id, page.sel),
    );
  },

  /**
   * Deploy to the selected site: close the window, then make the trip at full fade cover (the
   * cover hides the map swap, like a scene switch) and toast the arrival.
   */
  travel(scene, page) {
    const to = page.sel;
    const site = contentSites.get(to);
    if (site === undefined || to === scene.level.id) return;
    scene.window.close();
    const hours = ColonyMap.travelHours(scene.level.id, to);
    SceneTransition.start(() => {
      ColonyMap.travel(scene, to);
      Toast.push(I18n.text("WORLDMAP_ARRIVED", I18n.text(site.name), hours), {
        type: "info",
      });
    });
  },
};

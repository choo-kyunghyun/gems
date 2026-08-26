// The world map window — the colony's site picker, opened from a travel beacon (the "travel"
// InteractAction). Open/close/range-close owned by Interactable; all state on scene (_map*).
/**
 * A schematic chart: every contentSites site as a node placed at its chart-space `pos` over a dark
 * panel, the routes fanning out from the home site drawn under the nodes, and a brief for the
 * selected site beside it — terrain, size, threat, and the trip's hours from where the squad
 * stands. Travel hands the pick to ColonyMap.travel behind a SceneTransition cover.
 *
 * The nodes are REBUILT on every open and on every pick (a handful of buttons), so the "you are
 * here" mark and the selection colors follow the live map with no per-frame color swaps; a pick
 * only flags _mapDirty, and the rebuild runs from Interactable.update — never inside the click
 * that would be destroying the button mid-traversal.
 */
globalThis.WorldMapUI = {
  NODE_W: 150, // node button size (chart px at the design resolution)
  NODE_H: 36,

  build(scene) {
    scene._mapOpen = false;
    scene._mapDirty = false;
    scene._mapSel = ""; // selected site id
    scene._mapNodes = {}; // site id -> node element (the routes pass reads their centers)

    const host = gemsOverlay(I18n.textRef("WORLDMAP_TITLE"), {
      onClose: () => WorldMapUI.close(scene),
    });
    scene._mapWin = host;
    scene.ui.insertChild(host);
    const card = host.body;

    const row = new UIElement({
      width: "100%",
      flexGrow: 1,
      flexBasis: 0,
      flexDirection: "row",
      gap: GemsTheme.gap,
    });
    // the chart: the nodes hang off it by percentage position (refilled per open — see refresh)
    const chart = new UIElement({
      flexGrow: 1,
      flexBasis: 0,
      height: "100%",
    });
    chart.addComponent(
      new UIPanel({
        color: gemsColor(GemsTheme.panelLo),
        rad: GemsTheme.radiusSm,
        border: 1,
        borderColor: gemsColor(GemsTheme.border),
      }),
    );
    chart.addComponent(WorldMapUI._routes(scene)); // under the nodes (components draw first)
    scene._mapChart = chart;
    row.insertChild(chart);
    row.insertChild(WorldMapUI._brief(scene));
    card.insertChild(row);

    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      gemsLabel(I18n.textRef("WORLDMAP_HINT"), { color: GemsTheme.textMuted }),
    );
    card.insertChild(hint);
  },

  /** Open on the current site (selected) and lay the chart out. */
  open(scene) {
    scene._mapOpen = true;
    scene._mapSel = scene.level.id;
    scene._mapWin.enabled = true;
    WorldMapUI.refresh(scene);
  },

  close(scene) {
    scene._mapOpen = false;
    scene._mapWin.enabled = false;
  },

  /**
   * Rebuild the chart's nodes: one button per site at its chart position, colored by role —
   * the current site accent (primary), the selected one outlined gold, the rest plain — with the
   * "you are here" tag under the current one.
   */
  refresh(scene) {
    const chart = scene._mapChart;
    while (chart.children.length > 0) chart.children[0].destroy(); // destroy() unlinks from the parent
    scene._mapNodes = {};
    const sites = contentSites.SITES;
    const w = WorldMapUI.NODE_W;
    const h = WorldMapUI.NODE_H;
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      const here = s.id === scene.level.id;
      const picked = s.id === scene._mapSel;
      // a zero-size anchor at the site's chart position; the node holder hangs centered on it
      // (a gemsButton takes no position style of its own)
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
        opts.color = GemsTheme.btnHover;
        opts.borderColor = GemsTheme.warn;
      }
      holder.insertChild(
        gemsButton(
          I18n.textRef(s.name),
          () => {
            scene._mapSel = s.id;
            scene._mapDirty = true;
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
          gemsLabel(I18n.textRef("WORLDMAP_HERE"), {
            font: "description",
            color: GemsTheme.accent,
          }),
        );
        anchor.insertChild(tag);
      }
      chart.insertChild(anchor);
      scene._mapNodes[s.id] = holder;
    }
  },

  /**
   * The route lines, a UIComponent on the chart: home → every other site in the border color, and
   * the trip on the table (current → selected) over it in accent. Reads node centers live off
   * their layout, so a resize or a rebuild needs no bookkeeping.
   */
  _routes(scene) {
    return {
      onDraw(_el) {
        const nodes = scene._mapNodes;
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
            gemsColor(GemsTheme.border),
            gemsColor(GemsTheme.border),
          );
        }
        const cur = nodes[scene.level.id];
        const sel = nodes[scene._mapSel];
        if (cur !== undefined && sel !== undefined && cur !== sel) {
          const a = WorldMapUI._center(cur);
          const b = WorldMapUI._center(sel);
          draw_line_width_color(
            a.x,
            a.y,
            b.x,
            b.y,
            3,
            gemsColor(GemsTheme.accent),
            gemsColor(GemsTheme.accent),
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
   * scene._mapSel), and the Travel button (disabled on the site the squad already stands in).
   */
  _brief(scene) {
    const col = new UIElement({
      width: 340,
      height: "100%",
      gap: GemsTheme.gapSm,
    });
    col.insertChild(
      gemsLabel(() => WorldMapUI._siteText(scene, "name"), {
        font: "header",
        color: GemsTheme.text,
      }),
    );
    col.insertChild(
      gemsLabel(() => WorldMapUI._siteText(scene, "desc"), {
        color: GemsTheme.textMuted,
        wrap: 320,
      }),
    );
    col.insertChild(gemsDivider());
    col.insertChild(
      gemsKeyValueRow(I18n.textRef("WORLDMAP_TERRAIN"), () =>
        WorldMapUI._terrainText(scene),
      ),
    );
    col.insertChild(
      gemsKeyValueRow(I18n.textRef("WORLDMAP_SIZE"), () =>
        WorldMapUI._sizeText(scene),
      ),
    );
    col.insertChild(
      gemsKeyValueRow(I18n.textRef("WORLDMAP_THREAT"), () =>
        WorldMapUI._threatText(scene),
      ),
    );
    col.insertChild(
      gemsKeyValueRow(I18n.textRef("WORLDMAP_TRIP"), () =>
        WorldMapUI._tripText(scene),
      ),
    );
    col.insertChild(new UIElement({ flexGrow: 1 })); // push the button to the bottom
    col.insertChild(
      gemsButton(
        I18n.textRef("WORLDMAP_TRAVEL"),
        () => WorldMapUI.travel(scene),
        {
          primary: true,
          disabled: () => scene._mapSel === scene.level.id,
        },
      ),
    );
    return col;
  },

  _siteText(scene, key) {
    const s = contentSites.get(scene._mapSel);
    return s === undefined ? "" : I18n.text(s[key]);
  },

  /** the biome's name for a generated site; an authored site with no biome is indoor */
  _terrainText(scene) {
    const s = contentSites.get(scene._mapSel);
    if (s === undefined) return "";
    const biome =
      s.biome !== undefined ? contentBiomes.BIOMES[s.biome] : undefined;
    return I18n.text(biome !== undefined ? biome.name : "BIOME_INDOOR");
  },

  /** a resident site's grid, a synthesized site's def size; an unbuilt file site reads "-" */
  _sizeText(scene) {
    const s = contentSites.get(scene._mapSel);
    if (s === undefined) return "";
    const lv = World.get(s.id);
    if (lv !== null && lv.grid !== null)
      return I18n.text("WORLDMAP_SIZE_VAL", lv.grid.cols, lv.grid.rows);
    if (s.cols !== undefined)
      return I18n.text("WORLDMAP_SIZE_VAL", s.cols, s.rows);
    return "-";
  },

  _threatText(scene) {
    const s = contentSites.get(scene._mapSel);
    return s === undefined ? "" : I18n.text("THREAT_" + s.danger);
  },

  _tripText(scene) {
    if (scene._mapSel === scene.level.id) return "-";
    return I18n.text(
      "WORLDMAP_TRIP_VAL",
      ColonyMap.travelHours(scene.level.id, scene._mapSel),
    );
  },

  /**
   * Deploy to the selected site: close the window, then make the trip at full fade cover (the
   * cover hides the map swap, like a scene switch) and toast the arrival.
   */
  travel(scene) {
    const to = scene._mapSel;
    const site = contentSites.get(to);
    if (site === undefined || to === scene.level.id) return;
    Interactable.closeAll(scene);
    const hours = ColonyMap.travelHours(scene.level.id, to);
    SceneTransition.start(() => {
      ColonyMap.travel(scene, to);
      Toast.push(I18n.text("WORLDMAP_ARRIVED", I18n.text(site.name), hours), {
        type: "info",
      });
    });
  },
};

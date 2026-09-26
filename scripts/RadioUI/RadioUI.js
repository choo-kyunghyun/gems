/**
 * Radio tab of the inventory window.
 *
 * Built once; every label and selection reads live, so a tune shows the frame it lands and the tab
 * needs no rebuild hook.
 */
globalThis.RadioUI = {
  COLS: 2, // the whole dial would overrun the card in one column

  build(scene) {
    const page = new UIElement({ width: "100%", gap: FacetTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(
      facetLabel(I18n.textRef("RADIO_NOW"), { color: "warn" }),
    );
    page.insertChild(title);
    page.insertChild(
      facetKeyValueRow(I18n.textRef("RADIO_TRACK"), () => RadioUI._playing()),
    );
    page.insertChild(
      facetKeyValueRow(I18n.textRef("RADIO_TEMPO"), () =>
        RadioUI._tempo(Music.track()),
      ),
    );
    page.insertChild(facetDivider());
    const hint = new UIElement({ width: "100%", height: 20 });
    hint.insertChild(
      facetLabel(I18n.textRef("RADIO_HINT"), { color: FacetTheme.textDim }),
    );
    page.insertChild(hint);

    const dial = new UIElement({
      width: "100%",
      flexDirection: "row",
      gap: FacetTheme.gapSm,
    });
    const cols = [];
    for (let c = 0; c < RadioUI.COLS; c++) {
      const col = new UIElement({
        flexGrow: 1,
        flexBasis: 0,
        gap: FacetTheme.gapSm,
      });
      cols.push(col);
      dial.insertChild(col);
    }
    cols[0].insertChild(
      facetButton(I18n.textRef("RADIO_OFF"), () => Radio.off(), {
        height: FacetTheme.rowHSm,
        selected: () => !Radio.on(),
      }),
    );
    const stations = Radio.stations();
    for (let i = 0; i < stations.length; i++)
      cols[(i + 1) % RadioUI.COLS].insertChild(
        RadioUI._stationBtn(scene, stations[i]),
      );
    page.insertChild(dial);
    return page;
  },

  /** One dial button, lit while tuned. */
  _stationBtn(scene, def) {
    return facetButton(
      () => {
        const bpm = AssetMeta.bpm(def.asset);
        let s = I18n.text(def.name);
        if (bpm > 0) s += "   ·   " + I18n.text("RADIO_BPM", bpm);
        return s;
      },
      () => Radio.tune(def.asset),
      {
        height: FacetTheme.rowHSm,
        selected: () => Radio.station() === def.asset,
      },
    );
  },

  /** The playing track's name, the map's bed marked as such; silent for a nameless or no track. */
  _playing() {
    const def = AssetMeta.get(Music.track());
    if (def === undefined) return I18n.text("RADIO_SILENT");
    if (!def.name) return I18n.text("RADIO_SILENT");
    const name = I18n.text(def.name);
    return Radio.on() ? name : name + "  " + I18n.text("RADIO_BED");
  },

  /** A track's tempo, previewed. */
  _tempo(sound) {
    const bpm = AssetMeta.bpm(sound);
    const t = Math.round(Radio.tempo(sound) * 100) / 100;
    return (
      (bpm > 0 ? I18n.text("RADIO_BPM", bpm) : I18n.text("RADIO_UNTIMED")) +
      "   ·   x" +
      t
    );
  },

};

// The Radio tab of the inventory window: a now-playing readout over the dial — Off, then one
// button per station, the tuned one lit. The player's knob on the sim tempo: a timed station's
// BPM is the tick rate the world runs at while it plays (sceneColony.tempo).
/**
 * Built ONCE by InventoryUI.build; every label and `selected` reads Radio/Music/Time live, so a
 * tune shows the frame it lands and the tab needs no rebuild hook.
 */
globalThis.RadioUI = {
  COLS: 2, // dial columns — the whole dial at rowHSm would overrun the card in one

  /**
   * The tab page: the now-playing rows (track, tempo), a hint, then the dial dealt across COLS.
   */
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
        RadioUI._tempo(scene, Music.track()),
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

  /**
   * one dial button: "Name · 120 BPM · 120 TPS" (an untimed bed shows only its TPS), lit
   * while tuned
   */
  _stationBtn(scene, def) {
    return facetButton(
      () => {
        const bpm = SoundMeta.bpm(def.sound);
        let s = I18n.text(def.name);
        if (bpm > 0) s += "   ·   " + I18n.text("RADIO_BPM", bpm);
        return s + "   ·   " + I18n.text("RADIO_TPS", RadioUI._tps(scene, def.sound));
      },
      () => Radio.tune(def.sound),
      {
        height: FacetTheme.rowHSm,
        selected: () => Radio.station() === def.sound,
      },
    );
  },

  /**
   * the playing track's name — the bed is marked as the map's, a nameless or no track is "-"
   */
  _playing() {
    const def = SoundMeta.of(Music.track());
    if (def === undefined) return I18n.text("RADIO_SILENT");
    if (def.name === "") return I18n.text("RADIO_SILENT");
    const name = I18n.text(def.name);
    return Radio.on() ? name : name + "  " + I18n.text("RADIO_BED");
  },

  /**
   * "120 BPM · x2 · 120 TPS" for a track — the scene's tempo rule, previewed
   */
  _tempo(scene, sound) {
    const bpm = SoundMeta.bpm(sound);
    const t = Math.round(scene.tempo(sound) * 100) / 100;
    return (
      (bpm > 0 ? I18n.text("RADIO_BPM", bpm) : I18n.text("RADIO_UNTIMED")) +
      "   ·   x" +
      t +
      "   ·   " +
      I18n.text("RADIO_TPS", RadioUI._tps(scene, sound))
    );
  },

  /**
   * ticks per second the sim runs at while `sound` plays: the scene's tempo over the fixed tick
   */
  _tps(scene, sound) {
    return Math.round(scene.tempo(sound) / SimClock.tickDuration);
  },
};

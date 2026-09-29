/**
 * Settlement management page, opened over the settlement's centre structure and titled with the
 * level's settlement.
 * TODO: the management panels.
 */
globalThis.SettlementUI = {
  build(scene) {
    return {
      title: () => SettlementUI._title(scene),
      el: new UIElement({
        width: "100%",
        flexGrow: 1,
        flexBasis: 0,
        gap: FacetTheme.gapSm,
      }),
      refresh: () => {},
    };
  },

  _title(scene) {
    const s = Settlement.of(scene.level);
    return s !== undefined && s.name !== "" ? s.name : I18n.text("SETTLEMENT_TITLE");
  },
};

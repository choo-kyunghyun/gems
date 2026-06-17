// The app shell's single landing scene (`SCENES.lobby`), now a dev launcher reached via
// F2 (the app boots into the RPG). Title and lobby are merged here: a G.E.M.S. branding
// header over a single vertical column of buttons — every registered scene (RPG / Editor /
// UI Kit) followed by the global actions (Credits / Settings / Quit). No tabs or category
// sections: the catalogue is small enough to list flat. Settings and Credits open the
// SystemMenu overlay (Credits on its About tab), so there is no separate title/credits scene.

globalThis.SCENES = {
  lobby: () =>
    Object.assign(new Scene(), {
      label: "Lobby",

      create(openScene) {
        this.ui = gemsRoot({ maxWidth: 720 });
        UI.insert(this.ui);

        this.ui.insertChild(
          gemsHeader(I18n.textRef("APP_NAME"), { halign: fa_center }),
        );

        const col = gemsList();

        // A flat button per registered scene — no category headers/tabs. Ordered by a
        // fixed display priority (RPG flagship first, then Editor, then the rest) so the
        // list doesn't follow arbitrary resource load order; unknown categories sink last.
        const CAT_ORDER = [
          "SCENE_CAT_RPG",
          "SCENE_CAT_EDITOR",
          "SCENE_CAT_ACTION",
          "SCENE_CAT_UI",
        ];
        const entries = [];
        const groups = SceneRegistry.byCategory();
        for (let g = 0; g < groups.length; g++)
          for (let e = 0; e < groups[g].entries.length; e++)
            entries.push(groups[g].entries[e]);
        const rank = (cat) => {
          const i = CAT_ORDER.indexOf(cat);
          return i < 0 ? CAT_ORDER.length : i;
        };
        entries.sort((a, b) => rank(a.category) - rank(b.category));
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]; // capture for the click closure
          col.insertChild(
            gemsButton(entry.label, () => openScene(entry.factory)),
          );
        }

        // Global actions. Settings/Credits open the SystemMenu (Credits on its About
        // tab, index 2); Quit ends the game.
        col.insertChild(
          gemsButton(I18n.textRef("TITLE_CREDITS"), () => SystemMenu.open(2)),
        );
        col.insertChild(
          gemsButton(I18n.textRef("TITLE_SETTINGS"), () => SystemMenu.open()),
        );
        col.insertChild(
          gemsButton(I18n.textRef("TITLE_QUIT"), () =>
            openScene(() =>
              Object.assign(new Scene(), {
                create() {
                  game_end();
                },
              }),
            ),
          ),
        );

        this.ui.insertChild(col);
      },

      destroy() {
        UI.remove(this.ui);
        this.ui.destroy();
      },
    }),
};

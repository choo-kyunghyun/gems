// boot level + dev launcher (F2). flat button list of all registered scenes, then
// global actions (Credits/Settings/Quit via SystemMenu). no separate title/credits level.

globalThis.SCENES = {
  lobby: () =>
    Object.assign(new Level(), {
      label: "Lobby",

      create(openScene) {
        this._openScene = openScene; // stashed so retheme() can rebuild the button callbacks
        this._buildUI();
      },

      // Live theme swap (LevelManager.retheme): tear down + rebuild the UI so it bakes the new
      // palette. The lobby holds no world/gameplay state, so a plain UI rebuild is enough.
      retheme() {
        UI.remove(this.ui);
        this.ui.destroy();
        this._buildUI();
      },

      _buildUI() {
        const openScene = this._openScene;
        this.ui = gemsRoot({ maxWidth: 720 });
        UI.insert(this.ui);

        this.ui.insertChild(
          gemsHeader(I18n.textRef("APP_NAME"), { halign: fa_center }),
        );

        const col = gemsList();

        // fixed display priority so the list is stable regardless of resource load order
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
          const entry = entries[i];
          col.insertChild(
            gemsButton(entry.label, () => openScene(entry.factory)),
          );
        }

        // Credits opens SystemMenu About tab (index 2)
        col.insertChild(
          gemsButton(I18n.textRef("TITLE_CREDITS"), () => SystemMenu.open(2)),
        );
        col.insertChild(
          gemsButton(I18n.textRef("TITLE_SETTINGS"), () => SystemMenu.open()),
        );
        col.insertChild(
          gemsButton(I18n.textRef("TITLE_QUIT"), () =>
            openScene(() =>
              Object.assign(new Level(), {
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

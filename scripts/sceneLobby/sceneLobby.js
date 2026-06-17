// The app shell's single landing scene (`SCENES.lobby`, the boot scene). Title and lobby
// are merged here: G.E.M.S. branding header + a tabbed scene catalogue + a footer of
// global actions. Settings and Credits live in the SystemMenu overlay (the footer just
// opens it — Credits on its About tab), so there is no separate title or credits scene.
//
// Tabs group the SceneRegistry categories to mirror the project's IDE structure: RPG (the
// RPG game + its level Editor) and Showcase (everything demonstrable — the Action/Strategy
// movement showcases, the Map tech scenes, and the Interface demos). Each tab is a
// scrollable list of gemsSection-per-category buttons.
const LOBBY_TABS = [
  { key: "LOBBY_TAB_RPG", cats: ["SCENE_CAT_RPG", "SCENE_CAT_EDITOR"] },
  {
    key: "LOBBY_TAB_SHOWCASE",
    cats: ["SCENE_CAT_ACTION", "SCENE_CAT_UI"],
  },
];

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

        // Bucket the registry's categories into the three display tabs.
        const groups = SceneRegistry.byCategory();
        const byCat = {};
        for (let i = 0; i < groups.length; i++) {
          byCat[groups[i].category] = groups[i].entries;
        }

        const tabs = [];
        for (let t = 0; t < LOBBY_TABS.length; t++) {
          const def = LOBBY_TABS[t];
          const scroll = gemsScroll({ grow: true });
          let filled = false;
          for (let c = 0; c < def.cats.length; c++) {
            const entries = byCat[def.cats[c]];
            if (entries == null || entries.length === 0) continue;
            filled = true;
            const section = gemsSection(I18n.textRef(def.cats[c]));
            for (let e = 0; e < entries.length; e++) {
              const entry = entries[e]; // capture for the click closure
              section.insertChild(
                gemsButton(entry.label, () => openScene(entry.factory)),
              );
            }
            scroll.scrollBody.insertChild(section);
          }
          if (!filled) {
            const empty = gemsCard();
            empty.insertChild(
              gemsLabel(I18n.textRef("LOBBY_EMPTY"), {
                color: "#888888",
                halign: fa_center,
              }),
            );
            scroll.scrollBody.insertChild(empty);
          }
          tabs.push({ label: I18n.textRef(def.key), content: scroll });
        }
        // grow → the tab host fills the space between header and footer and reflows
        // when the GUI is resized (live uiScale), pushing the footer to the bottom.
        this.ui.insertChild(gemsTabs(tabs, { grow: true }));

        // Footer: global actions. Settings/Credits open the SystemMenu (Credits on its
        // About tab, index 2); Quit ends the game.
        const footer = gemsGrid();
        footer.insertChild(
          gemsButton(I18n.textRef("TITLE_SETTINGS"), () => SystemMenu.open(), {
            width: 200,
          }),
        );
        footer.insertChild(
          gemsButton(I18n.textRef("TITLE_CREDITS"), () => SystemMenu.open(2), {
            width: 200,
          }),
        );
        footer.insertChild(
          gemsButton(
            I18n.textRef("TITLE_QUIT"),
            () =>
              openScene(() =>
                Object.assign(new Scene(), {
                  create() {
                    game_end();
                  },
                }),
              ),
            { width: 200 },
          ),
        );
        this.ui.insertChild(footer);
      },

      destroy() {
        UI.remove(this.ui);
        this.ui.destroy();
      },
    }),
};

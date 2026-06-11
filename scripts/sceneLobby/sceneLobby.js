globalThis.SCENES = {
  title: () =>
    Object.assign(new Scene(), {
      label: "Title",

      create(openScene) {
        this.ui = gemsRoot();
        UI.insert(this.ui);

        this.ui.insertChild(
          gemsHeader(I18n.textRef("APP_NAME"), { height: 80, halign: fa_center }),
        );

        this.ui.insertChild(gemsButton(I18n.textRef("TITLE_DEMO"),     () => openScene(SCENES.lobby)));
        this.ui.insertChild(gemsButton(I18n.textRef("TITLE_SETTINGS"), () => openScene(SCENES.settings)));
        this.ui.insertChild(gemsButton(I18n.textRef("TITLE_CREDITS"),  () => openScene(SCENES.credits)));
        this.ui.insertChild(
          gemsButton(I18n.textRef("TITLE_QUIT"), () =>
            openScene(() => Object.assign(new Scene(), { create() { game_end(); } })),
          ),
        );
      },

      destroy() {
        UI.remove(this.ui);
        this.ui.destroy();
      },
    }),

  lobby: () =>
    Object.assign(new Scene(), {
      label: "Lobby",

      create(openScene) {
        this.ui = gemsRoot();
        UI.insert(this.ui);

        this.ui.insertChild(gemsHeader(I18n.textRef("LOBBY_HEADING")));

        const groups = SceneRegistry.byCategory();
        if (groups.length === 0) {
          const empty = gemsCard();
          empty.insertChild(
            gemsLabel(I18n.textRef("LOBBY_EMPTY"), { color: "#888888", halign: fa_center }),
          );
          this.ui.insertChild(empty);
        } else {
          for (const group of groups) {
            const section = gemsSection(I18n.textRef(group.category));
            for (const e of group.entries) {
              section.insertChild(gemsButton(e.label, () => openScene(e.factory)));
            }
            this.ui.insertChild(section);
          }
        }

        this.ui.insertChild(gemsButton(I18n.textRef("LOBBY_BACK"), () => openScene(SCENES.title)));
      },

      destroy() {
        UI.remove(this.ui);
        this.ui.destroy();
      },
    }),

  settings: () =>
    Object.assign(new Scene(), {
      label: "Settings",

      create(openScene) {
        this.ui = gemsRoot();
        UI.insert(this.ui);

        this.ui.insertChild(gemsHeader(I18n.textRef("SETTINGS_HEADING")));

        const volSection = gemsSection(I18n.textRef("SETTINGS_VOL_TITLE"));
        volSection.insertChild(gemsRow(I18n.textRef("SETTINGS_VOL_MASTER"), gemsSlider("volMaster")));
        volSection.insertChild(gemsRow(I18n.textRef("SETTINGS_VOL_MUSIC"),  gemsSlider("volMusic")));
        volSection.insertChild(gemsRow(I18n.textRef("SETTINGS_VOL_SFX"),    gemsSlider("volSfx")));
        this.ui.insertChild(volSection);

        const dispSection = gemsSection(I18n.textRef("SETTINGS_DISP_TITLE"));
        dispSection.insertChild(
          gemsToggle(
            I18n.textRef("SETTINGS_DISP_FULLSCREEN"),
            () => Settings.get("fullscreen"),
            () => {
              Settings.set("fullscreen", !Settings.get("fullscreen"));
              window_set_fullscreen(Settings.get("fullscreen"));
            },
            {
              onText: I18n.textRef("SETTINGS_DISP_FULLSCREEN_ON"),
              offText: I18n.textRef("SETTINGS_DISP_FULLSCREEN_OFF"),
            },
          ),
        );

        const resItems = [
          { name: I18n.text("SETTINGS_DISP_RES_DEFAULT"), value: { w: 0, h: 0 } },
          { name: "1280×720",  value: { w: 1280, h: 720 } },
          { name: "1920×1080", value: { w: 1920, h: 1080 } },
        ];
        const curResW = Settings.get("resolutionW");
        const resIdx = Math.max(
          0,
          resItems.findIndex((r) => r.value.w === curResW),
        );
        dispSection.insertChild(
          gemsRow(
            I18n.textRef("SETTINGS_DISP_RESOLUTION"),
            gemsSelectCustom(resItems, resIdx, (_i, res) => {
              Settings.set("resolutionW", res.w);
              Settings.set("resolutionH", res.h);
            }),
          ),
        );
        dispSection.insertChild(
          gemsRow(
            I18n.textRef("SETTINGS_DISP_FPS"),
            gemsSelect("fpsLimit", [
              { name: "30",  value: 30 },
              { name: "60",  value: 60 },
              { name: "120", value: 120 },
              { name: I18n.text("SETTINGS_DISP_FPS_UNLIMITED"), value: 0 },
            ]),
          ),
        );
        this.ui.insertChild(dispSection);

        const uiSection = gemsSection(I18n.textRef("SETTINGS_UI_TITLE"));
        uiSection.insertChild(gemsRow(I18n.textRef("SETTINGS_UI_SCALE"), gemsSlider("uiScale", 0.5, 2, 0.1)));
        this.ui.insertChild(uiSection);

        const langSection = gemsSection(I18n.textRef("SETTINGS_LANG_TITLE"));
        const langItems = [
          { name: I18n.text("LANG_EN_US"), value: "en-US" },
          { name: I18n.text("LANG_KO_KR"), value: "ko-KR" },
        ];
        const langIdx = Math.max(
          0,
          langItems.findIndex((it) => it.value === Settings.get("language")),
        );
        langSection.insertChild(
          gemsRow(
            I18n.textRef("SETTINGS_LANG_LABEL"),
            // Switching language reloads I18n and re-adopts the locale's base font,
            // so the open UI (built from live textRefs) updates in place.
            gemsSelectCustom(langItems, langIdx, (_i, value) => {
              Settings.set("language", value);
              I18n.load("i18n/" + value + "/manifest.json");
              draw_set_font(I18n.font("default"));
            }),
          ),
        );
        this.ui.insertChild(langSection);

        this.ui.insertChild(gemsButton(I18n.textRef("SETTINGS_SAVE"), () => Settings.save()));
        this.ui.insertChild(gemsButton(I18n.textRef("SETTINGS_BACK"), () => openScene(SCENES.title)));
      },

      destroy() {
        UI.remove(this.ui);
        this.ui.destroy();
      },
    }),

  credits: () =>
    Object.assign(new Scene(), {
      label: "Credits",

      create(openScene) {
        this.ui = gemsRoot();
        UI.insert(this.ui);

        this.ui.insertChild(gemsHeader(I18n.textRef("CREDITS_HEADING")));

        const body = gemsCard({ gap: GemsTheme.gapSm });

        const lines = [
          [I18n.textRef("CREDITS_NAME"),    "#ffffff"],
          [I18n.textRef("CREDITS_TAGLINE"), "#cccccc"],
          [() => "",                        "#000000"],
          [I18n.textRef("CREDITS_DEV"),     "#aaaaaa"],
          [() => "",                        "#000000"],
          [I18n.textRef("CREDITS_ENGINE"),  "#777777"],
          [I18n.textRef("CREDITS_LIBS"),    "#777777"],
        ];
        for (let i = 0; i < lines.length; i++) {
          body.insertChild(gemsLabel(lines[i][0], { color: lines[i][1] }));
        }
        this.ui.insertChild(body);

        this.ui.insertChild(gemsButton(I18n.textRef("CREDITS_BACK"), () => openScene(SCENES.title)));
      },

      destroy() {
        UI.remove(this.ui);
        this.ui.destroy();
      },
    }),
};

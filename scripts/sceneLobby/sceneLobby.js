globalThis.SCENES = {
  title: () =>
    Object.assign(new Scene(), {
      label: "Title",

      create(openScene) {
        this.ui = new UIElement({
          width: "100%",
          height: "100%",
          padding: 16,
          gap: 12,
        });
        UI.insert(this.ui);

        const header = new UIElement({
          width: "100%",
          height: 80,
          paddingHorizontal: 16,
          paddingVertical: 4,
        });
        header.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 16 }));
        this.ui.insertChild(header);

        const titleText = new UIElement();
        titleText.addComponent(new UIText({ textRef: I18n.textRef("APP_NAME"), halign: fa_center }));
        header.insertChild(titleText);

        this.ui.insertChild(makeButton(I18n.textRef("TITLE_DEMO"),     () => openScene(SCENES.lobby)));
        this.ui.insertChild(makeButton(I18n.textRef("TITLE_SETTINGS"), () => openScene(SCENES.settings)));
        this.ui.insertChild(makeButton(I18n.textRef("TITLE_CREDITS"),  () => openScene(SCENES.credits)));
        this.ui.insertChild(
          makeButton(I18n.textRef("TITLE_QUIT"), () =>
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
        this.ui = new UIElement({
          width: "100%",
          height: "100%",
          padding: 16,
          gap: 12,
        });
        UI.insert(this.ui);

        const header = new UIElement({
          width: "100%",
          height: 60,
          paddingHorizontal: 16,
          paddingVertical: 8,
        });
        header.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 12 }));
        const headerTitle = new UIElement();
        headerTitle.addComponent(new UIText({ textRef: I18n.textRef("LOBBY_HEADING") }));
        header.insertChild(headerTitle);
        this.ui.insertChild(header);

        const groups = SceneRegistry.byCategory();
        if (groups.length === 0) {
          const empty = new UIElement({ width: "100%", padding: 16 });
          empty.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 12 }));
          const msg = new UIElement();
          msg.addComponent(new UIText({ textRef: I18n.textRef("LOBBY_EMPTY"), color: Color.parse("#888888"), halign: fa_center }));
          empty.insertChild(msg);
          this.ui.insertChild(empty);
        } else {
          for (const group of groups) {
            const section = makeSection(I18n.textRef(group.category));
            for (const e of group.entries) {
              section.insertChild(makeButton(e.label, () => openScene(e.factory)));
            }
            this.ui.insertChild(section);
          }
        }

        this.ui.insertChild(makeButton(I18n.textRef("LOBBY_BACK"), () => openScene(SCENES.title)));
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
        this.ui = new UIElement({
          width: "100%",
          height: "100%",
          padding: 16,
          gap: 12,
        });
        UI.insert(this.ui);

        const header = new UIElement({
          width: "100%",
          height: 60,
          paddingHorizontal: 16,
          paddingVertical: 8,
        });
        header.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 12 }));
        const headerTitle = new UIElement();
        headerTitle.addComponent(new UIText({ textRef: I18n.textRef("SETTINGS_HEADING") }));
        header.insertChild(headerTitle);
        this.ui.insertChild(header);

        const volSection = makeSection(I18n.textRef("SETTINGS_VOL_TITLE"));
        volSection.insertChild(makeRow(I18n.textRef("SETTINGS_VOL_MASTER"), makeSlider("volMaster")));
        volSection.insertChild(makeRow(I18n.textRef("SETTINGS_VOL_MUSIC"),  makeSlider("volMusic")));
        volSection.insertChild(makeRow(I18n.textRef("SETTINGS_VOL_SFX"),    makeSlider("volSfx")));
        this.ui.insertChild(volSection);

        const dispSection = makeSection(I18n.textRef("SETTINGS_DISP_TITLE"));
        dispSection.insertChild(
          makeRow(
            I18n.textRef("SETTINGS_DISP_FULLSCREEN"),
            makeButton(
              () => (Settings.get("fullscreen") ? I18n.text("SETTINGS_DISP_FULLSCREEN_ON") : I18n.text("SETTINGS_DISP_FULLSCREEN_OFF")),
              () => {
                Settings.set("fullscreen", !Settings.get("fullscreen"));
                window_set_fullscreen(Settings.get("fullscreen"));
              },
            ),
          ),
        );

        const resItems = [
          { name: I18n.text("SETTINGS_DISP_RES_DEFAULT"), value: { w: 0, h: 0 } },
          { name: "1280×720",  value: { w: 1280, h: 720 } },
          { name: "1920×1080", value: { w: 1920, h: 1080 } },
        ];
        const resEl = new UIElement({ height: 36, width: "100%" });
        const curResW = Settings.get("resolutionW");
        const resIdx = Math.max(
          0,
          resItems.findIndex((r) => r.value.w === curResW),
        );
        resEl.addComponent(
          new UISelect({
            items: resItems,
            index: resIdx,
            onChange: (_i, res) => {
              Settings.set("resolutionW", res.w);
              Settings.set("resolutionH", res.h);
            },
            halign: fa_center,
          }),
        );
        dispSection.insertChild(makeRow(I18n.textRef("SETTINGS_DISP_RESOLUTION"), resEl));
        dispSection.insertChild(
          makeRow(
            I18n.textRef("SETTINGS_DISP_FPS"),
            makeSelect("fpsLimit", [
              { name: "30",  value: 30 },
              { name: "60",  value: 60 },
              { name: "120", value: 120 },
              { name: I18n.text("SETTINGS_DISP_FPS_UNLIMITED"), value: 0 },
            ]),
          ),
        );
        this.ui.insertChild(dispSection);

        const uiSection = makeSection(I18n.textRef("SETTINGS_UI_TITLE"));
        uiSection.insertChild(makeRow(I18n.textRef("SETTINGS_UI_SCALE"), makeSlider("uiScale", 0.5, 2, 0.1)));
        this.ui.insertChild(uiSection);

        const langSection = makeSection(I18n.textRef("SETTINGS_LANG_TITLE"));
        const langItems = [
          { name: I18n.text("LANG_EN_US"), value: "en-US" },
          { name: I18n.text("LANG_KO_KR"), value: "ko-KR" },
        ];
        const langEl = new UIElement({ height: 36, width: "100%" });
        langEl.addComponent(
          new UISelect({
            items: langItems,
            index: Math.max(
              0,
              langItems.findIndex((it) => it.value === Settings.get("language")),
            ),
            // Switching language reloads I18n and re-adopts the locale's base
            // font, so the open UI (built from live textRefs) updates in place.
            onChange: (_i, value) => {
              Settings.set("language", value);
              I18n.load("i18n/" + value + "/manifest.json");
              draw_set_font(I18n.font("default"));
            },
            halign: fa_center,
          }),
        );
        langSection.insertChild(makeRow(I18n.textRef("SETTINGS_LANG_LABEL"), langEl));
        this.ui.insertChild(langSection);

        this.ui.insertChild(makeButton(I18n.textRef("SETTINGS_SAVE"), () => Settings.save()));
        this.ui.insertChild(makeButton(I18n.textRef("SETTINGS_BACK"), () => openScene(SCENES.title)));
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
        this.ui = new UIElement({
          width: "100%",
          height: "100%",
          padding: 16,
          gap: 12,
        });
        UI.insert(this.ui);

        const header = new UIElement({
          width: "100%",
          height: 60,
          paddingHorizontal: 16,
          paddingVertical: 8,
        });
        header.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 12 }));
        const headerTitle = new UIElement();
        headerTitle.addComponent(new UIText({ textRef: I18n.textRef("CREDITS_HEADING") }));
        header.insertChild(headerTitle);
        this.ui.insertChild(header);

        const body = new UIElement({ width: "100%", padding: 16, gap: 8 });
        body.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 12 }));

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
          const row = new UIElement();
          row.addComponent(new UIText({ textRef: lines[i][0], color: Color.parse(lines[i][1]) }));
          body.insertChild(row);
        }
        this.ui.insertChild(body);

        this.ui.insertChild(makeButton(I18n.textRef("CREDITS_BACK"), () => openScene(SCENES.title)));
      },

      destroy() {
        UI.remove(this.ui);
        this.ui.destroy();
      },
    }),
};

function makeButton(label, onClick) {
  const textRef = typeof label === "function" ? label : () => label;
  const btn = new UIElement({ height: 48, width: "100%" });
  btn.addComponent(new UIPanel({ color: Color.parse("#3a3a3a"), rad: 8 }));
  btn.addComponent(new UITrigger({ onClick }));
  btn.addComponent(
    new UIButton({
      colorNormal: Color.parse("#3a3a3a"),
      colorHover: Color.parse("#505050"),
      colorPress: Color.parse("#2a2a2a"),
    }),
  );
  const text = new UIElement();
  text.addComponent(new UIText({ textRef, halign: fa_center }));
  btn.insertChild(text);
  return btn;
}

function makeSection(title) {
  const section = new UIElement({ width: "100%", padding: 12, gap: 10 });
  section.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 12 }));
  const header = new UIElement();
  header.addComponent(new UIText({ textRef: () => title, color: Color.parse("#aaaaaa") }));
  section.insertChild(header);
  return section;
}

function makeRow(label, control) {
  const row = new UIElement({ width: "100%", gap: 8 });
  const lbl = new UIElement();
  lbl.addComponent(new UIText({ textRef: () => label }));
  row.insertChild(lbl);
  row.insertChild(control);
  return row;
}

function makeSlider(key, min = 0, max = 1, step = undefined) {
  const el = new UIElement({ height: 24, width: "100%" });
  el.addComponent(
    new UISlider({
      min,
      max,
      value: Settings.get(key),
      step,
      onChange: (v) => Settings.set(key, v),
    }),
  );
  return el;
}

function makeSelect(key, items) {
  const el = new UIElement({ height: 36, width: "100%" });
  const currentVal = Settings.get(key);
  const idx = Math.max(
    0,
    items.findIndex((item) => item.value === currentVal),
  );
  el.addComponent(
    new UISelect({
      items,
      index: idx,
      onChange: (_i, value) => Settings.set(key, value),
      halign: fa_center,
    }),
  );
  return el;
}

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
        titleText.addComponent(new UIText({ textRef: () => "G.E.M.S.", halign: fa_center }));
        header.insertChild(titleText);

        this.ui.insertChild(makeButton("시작", () => openScene(SCENES.start)));
        this.ui.insertChild(makeButton("설정", () => openScene(SCENES.settings)));
        this.ui.insertChild(makeButton("크레딧", () => openScene(SCENES.credits)));
        this.ui.insertChild(
          makeButton("종료", () =>
            openScene(() => Object.assign(new Scene(), { create() { game_end(); } })),
          ),
        );
      },

      destroy() {
        UI.remove(this.ui);
        this.ui.destroy();
      },
    }),

  start: () =>
    Object.assign(new Scene(), {
      label: "Start",

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
        headerTitle.addComponent(new UIText({ textRef: () => "시작" }));
        header.insertChild(headerTitle);
        this.ui.insertChild(header);

        const content = new UIElement({ padding: 16 });
        content.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 12 }));
        const msg = new UIElement();
        msg.addComponent(new UIText({ textRef: () => "준비 중...", color: Color.parse("#888888"), halign: fa_center }));
        content.insertChild(msg);
        this.ui.insertChild(content);

        this.ui.insertChild(makeButton("← 타이틀", () => openScene(SCENES.title)));
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
        headerTitle.addComponent(new UIText({ textRef: () => "설정" }));
        header.insertChild(headerTitle);
        this.ui.insertChild(header);

        // 볼륨
        const volSection = makeSection("볼륨");
        volSection.insertChild(makeRow("마스터", makeSlider("volMaster")));
        volSection.insertChild(makeRow("음악", makeSlider("volMusic")));
        volSection.insertChild(makeRow("효과음", makeSlider("volSfx")));
        this.ui.insertChild(volSection);

        // 화면
        const dispSection = makeSection("화면");
        dispSection.insertChild(
          makeRow(
            "전체화면",
            makeButton(
              () => (Settings.get("fullscreen") ? "켜짐" : "꺼짐"),
              () => {
                Settings.set("fullscreen", !Settings.get("fullscreen"));
                window_set_fullscreen(Settings.get("fullscreen"));
              },
            ),
          ),
        );

        const resItems = [
          { name: "기본", value: { w: 0, h: 0 } },
          { name: "1280×720", value: { w: 1280, h: 720 } },
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
        dispSection.insertChild(makeRow("해상도", resEl));
        dispSection.insertChild(
          makeRow(
            "FPS",
            makeSelect("fpsLimit", [
              { name: "30", value: 30 },
              { name: "60", value: 60 },
              { name: "120", value: 120 },
              { name: "무제한", value: 0 },
            ]),
          ),
        );
        this.ui.insertChild(dispSection);

        // UI 스케일
        const uiSection = makeSection("UI 스케일");
        uiSection.insertChild(makeRow("스케일", makeSlider("uiScale", 0.5, 2, 0.1)));
        this.ui.insertChild(uiSection);

        // 언어
        const langSection = makeSection("언어");
        langSection.insertChild(
          makeRow(
            "언어",
            makeSelect("language", [{ name: "한국어", value: "ko-KR" }]),
          ),
        );
        this.ui.insertChild(langSection);

        this.ui.insertChild(makeButton("저장", () => Settings.save()));
        this.ui.insertChild(makeButton("← 타이틀", () => openScene(SCENES.title)));
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
        headerTitle.addComponent(new UIText({ textRef: () => "크레딧" }));
        header.insertChild(headerTitle);
        this.ui.insertChild(header);

        const body = new UIElement({ width: "100%", padding: 16, gap: 8 });
        body.addComponent(new UIPanel({ color: Color.parse("#282828"), rad: 12 }));

        const lines = [
          ["G.E.M.S.", "#ffffff"],
          ["GameMaker Entity & Map System", "#cccccc"],
          ["", "#000000"],
          ["개발  Choo Kyunghyun", "#aaaaaa"],
          ["", "#000000"],
          ["GameMaker 2026  ·  GMRT 0.19", "#777777"],
          ["flexpanel  ·  Noto Sans KR (SIL OFL 1.1)", "#777777"],
        ];
        for (let i = 0; i < lines.length; i++) {
          const text = lines[i][0];
          const lineColor = lines[i][1];
          const row = new UIElement();
          row.addComponent(new UIText({ textRef: () => text, color: Color.parse(lineColor) }));
          body.insertChild(row);
        }
        this.ui.insertChild(body);

        this.ui.insertChild(makeButton("← 타이틀", () => openScene(SCENES.title)));
      },

      destroy() {
        UI.remove(this.ui);
        this.ui.destroy();
      },
    }),
};

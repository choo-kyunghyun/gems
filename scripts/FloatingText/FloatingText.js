// World-space floating combat numbers (rise + fade) — standalone singleton, drawn in WORLD space from
// a level's draw() (in camera view), not Draw_75. Ages by Time.delta (sim time) not Time.raw (clock split).
globalThis.FloatingText = {
  _items: [], // { x, y, text, color, age, life, rise, scale }

  life: 0.9, // seconds on screen (incl. fades)
  rise: 60, // world px risen over life (32px-cell scale)
  fadeIn: 0.12, // pop / fade-in time (seconds)

  font: -1,
  shadowColor: Color.parse("#0a0c10"),

  // type → color; `info` is the unknown-type fallback. These are only the pre-theme defaults —
  // GemsTheme._applyCore overwrites all but `info` from the active palette on every mode switch.
  colors: {
    damage: Color.parse("#f1f4fa"), // enemy hit — white
    hurt: Color.parse("#e0584f"), // player hit — red
    heal: Color.parse("#54c98a"), // restore — green
    crit: Color.parse("#ffd166"), // big/critical — gold
    mana: Color.parse("#4a9eff"), // resource — blue
    info: Color.parse("#cfd6e4"),
  },

  /** opts: { type, color, life, rise, scale }. */
  push(x, y, text, opts = {}) {
    const type = opts.type ?? "damage";
    FloatingText._items.push({
      x: x,
      y: y,
      text: "" + text,
      color:
        opts.color ?? FloatingText.colors[type] ?? FloatingText.colors.info,
      age: 0,
      life: opts.life ?? FloatingText.life,
      rise: opts.rise ?? FloatingText.rise,
      scale: opts.scale ?? 2, // world-space text under a half-zoom camera — ×2 keeps screen size
    });
  },

  /** called on every level swap. */
  clear() {
    FloatingText._items = [];
  },

  /**
   * age + cull + draw in WORLD space (from a level's draw(), after entities). Under a 2.5D pitched
   * camera, pitchDeg tilts each number to face the camera head-on (text readability — unlike the
   * entity sprites, which draw UPRIGHT via RenderBillboard) instead of splayed flat; 0 = flat
   * top-down. sceneRpg passes the LIVE camera pitch, so the pitch-by-zoom curve is tracked.
   */
  draw(pitchDeg = 0) {
    const items = FloatingText._items;
    if (items.length === 0) return;

    // cull expired; build survivors array to avoid mutation mid-iterate
    const dt = Time.delta;
    const live = [];
    for (let i = 0; i < items.length; i++) {
      items[i].age += dt;
      if (items[i].age < items[i].life) live.push(items[i]);
    }
    FloatingText._items = live;
    if (live.length === 0) return;

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const alpha = draw_get_alpha();
    if (FloatingText.font !== -1) draw_set_font(FloatingText.font);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);

    // 2.5D: tilt each number to face the pitched camera head-on (readability; entity sprites
    // themselves are upright — RenderBillboard).
    // depth test OFF so a number is never occluded by the entity it reports on (always-on-top feedback).
    const billboard = pitchDeg !== 0;
    const tilt = -pitchDeg;
    const ident = matrix_build_identity();
    gpu_set_ztestenable(false);

    const sh = FloatingText.shadowColor;
    for (let i = 0; i < live.length; i++) {
      const t = live[i];
      const p = t.age / t.life; // 0..1 progress

      const riseAmt = Tween.easeOutCubic(p) * t.rise; // decelerating rise
      // fade in fast, fade out over the last 35% of life
      const fadeIn = clamp(t.age / FloatingText.fadeIn, 0, 1);
      const fadeOut = clamp((t.life - t.age) / (t.life * 0.35), 0, 1);
      const a = Math.min(fadeIn, fadeOut);
      const sc = t.scale * (0.6 + 0.4 * Tween.easeOutBack(fadeIn)); // entry pop overshoot

      // billboarded numbers sit at foot via the stood-up matrix, glyph origin local (0,0)
      let ox, oy;
      if (billboard) {
        matrix_set(
          matrix_world,
          matrix_build(t.x, t.y, 0, tilt, 0, 0, 1, 1, 1),
        );
        ox = 0;
        oy = -riseAmt;
      } else {
        ox = t.x;
        oy = t.y - riseAmt;
      }

      const c = t.color;
      // shadow first (1px offset), then the glyph
      draw_set_alpha(a * 0.7);
      draw_text_transformed_color(
        ox + 1,
        oy + 1,
        t.text,
        sc,
        sc,
        0,
        sh,
        sh,
        sh,
        sh,
        1,
      );
      draw_set_alpha(a);
      draw_text_transformed_color(ox, oy, t.text, sc, sc, 0, c, c, c, c, 1);
      if (billboard) matrix_set(matrix_world, ident);
    }

    gpu_set_ztestenable(true); // restore the global default (depth test on)
    if (FloatingText.font !== -1) draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_alpha(alpha);
  },
};

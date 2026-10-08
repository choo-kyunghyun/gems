// Floating combat numbers, drawn in world space under the camera. They age by sim time, so a
// paused sim holds them (docs/ARCHITECTURE.md → clock split), and live on their level, in its
// coordinates, so a parked map keeps its own and a freed one takes them with it.
globalThis.FloatingText = {
  KEY: "floating_text", // the numbers' derived token on the level's own entity

  life: 0.9, // seconds on screen, fades included
  rise: 60, // world px risen over life
  fadeIn: 0.12, // seconds
  scale: 2, // world px per font px, sized for the camera's home zoom
  shadowOffset: 1, // world px

  font: -1,
  shadowColor: Color.parse("#0a0c10"),

  // type → color; `info` is the unknown-type fallback. Only pre-theme defaults: a theme may
  // overwrite them on a mode switch.
  colors: {
    damage: Color.parse("#f1f4fa"), // enemy hit
    hurt: Color.parse("#e0584f"), // player hit
    heal: Color.parse("#54c98a"),
    crit: Color.parse("#ffd166"),
    mana: Color.parse("#4a9eff"),
    info: Color.parse("#cfd6e4"),
  },

  /** The level's numbers, `{ x, y, text, color, age, life, rise, scale }` each. */
  items(level) {
    return level.entities.derive(level.self, FloatingText.KEY, () => []);
  },

  /** opts: { type, color, life, rise, scale }. */
  push(level, x, y, text, opts = {}) {
    const type = opts.type ?? "damage";
    FloatingText.items(level).push({
      x: x,
      y: y,
      text: "" + text,
      color:
        opts.color ?? FloatingText.colors[type] ?? FloatingText.colors.info,
      age: 0,
      life: opts.life ?? FloatingText.life,
      rise: opts.rise ?? FloatingText.rise,
      scale: opts.scale ?? FloatingText.scale,
    });
  },

  /**
   * Ages, culls and draws the level's numbers, in world space after the entities. `pitchDeg`
   * tilts each number to face a pitched camera head-on for readability; 0 is flat top-down.
   */
  draw(level, pitchDeg = 0) {
    const live = FloatingText.items(level);
    if (live.length === 0) return;

    const dt = Time.delta;
    let w = 0;
    for (let i = 0; i < live.length; i++) {
      live[i].age += dt;
      if (live[i].age < live[i].life) live[w++] = live[i];
    }
    live.length = w;
    if (w === 0) return;

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const alpha = draw_get_alpha();
    if (FloatingText.font !== -1) draw_set_font(FloatingText.font);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);

    // depth test off, so a number is never occluded by the entity it reports on
    const billboard = pitchDeg !== 0;
    const tilt = -pitchDeg;
    const ident = matrix_build_identity();
    gpu_set_ztestenable(false);

    const sh = FloatingText.shadowColor;
    const off = FloatingText.shadowOffset;
    for (let i = 0; i < live.length; i++) {
      const t = live[i];
      const p = t.age / t.life;

      const riseAmt = curve(acEaseOutCubic, p) * t.rise;
      const fadeIn = clamp(t.age / FloatingText.fadeIn, 0, 1);
      const fadeOut = clamp((t.life - t.age) / (t.life * 0.35), 0, 1);
      const a = Math.min(fadeIn, fadeOut);
      const sc = t.scale * (0.6 + 0.4 * curve(acEaseOutBack, fadeIn)); // entry pop overshoot

      // a billboarded number draws at the local origin of its stood-up matrix
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
      draw_set_alpha(a * 0.7);
      draw_text_transformed_color(
        ox + off,
        oy + off,
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

    gpu_set_ztestenable(true); // the global default
    if (FloatingText.font !== -1) draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_alpha(alpha);
  },
};

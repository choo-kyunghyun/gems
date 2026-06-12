/**
 * FloatingText — world-space floating combat text (damage / heal / status numbers
 * that rise + fade). Standalone static singleton, like Toast / Dialogue, but unlike
 * those it draws in WORLD space, so its `draw()` is called from a scene's own draw()
 * (inside the camera view), NOT from obj_game Draw_75. Push from gameplay code:
 *
 *   FloatingText.push(worldX, worldY, 12, { type: "damage" });   // white "12"
 *   FloatingText.push(worldX, worldY, "+8", { type: "heal" });   // green "+8"
 *
 * Wiring: a scene calls `FloatingText.draw()` in its draw() after the entities (world
 * space); obj_game calls `FloatingText.clear()` on every scene swap (a number must not
 * survive into the next scene, where its world coords are meaningless).
 *
 * GMRT/timing notes: numbers are drawn at caller-supplied world coords (no flexpanel,
 * no NaN-width hazard, no `!(pos.width > 0)` guard). Unlike the GUI singletons this
 * ages by Time.delta (sim time), NOT Time.raw — it's gameplay feedback, so a slow-mo /
 * time-dilation effect should slow the numbers too. The rise/pop use Tween curves (#16).
 */
globalThis.FloatingText = class FloatingText {
  static _items = []; // { x, y, text, color, age, life, rise, scale }

  static life = 0.9; // seconds on screen (incl. fades)
  static rise = 30; // pixels risen over life
  static fadeIn = 0.12; // pop / fade-in time (seconds)

  static font = -1;
  static shadowColor = Color.parse("#0a0c10");

  // Type → text color. `info` is the fallback for an unknown type.
  static colors = {
    damage: Color.parse("#f1f4fa"), // enemy hit — white
    hurt: Color.parse("#e0584f"), // player hit — red
    heal: Color.parse("#54c98a"), // restore — green
    crit: Color.parse("#ffd166"), // big/critical — gold
    mana: Color.parse("#4a9eff"), // resource — blue
    info: Color.parse("#cfd6e4"),
  };

  // text may be a number or string; opts: { type, color, life, rise, scale }.
  static push(x, y, text, opts = {}) {
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
      scale: opts.scale ?? 1,
    });
  }

  static clear() {
    FloatingText._items = [];
  }

  static draw() {
    const items = FloatingText._items;
    if (items.length === 0) return;

    // Age + cull expired (build survivors; no Array mutation mid-iterate, like Toast).
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

    const sh = FloatingText.shadowColor;
    for (let i = 0; i < live.length; i++) {
      const t = live[i];
      const p = t.age / t.life; // 0..1 progress

      // Rise, decelerating (easeOutCubic) so the number shoots up then settles.
      const y = t.y - Tween.easeOutCubic(p) * t.rise;
      // Fade in fast, hold, then fade out over the last 35% of life.
      const fadeIn = clamp(t.age / FloatingText.fadeIn, 0, 1);
      const fadeOut = clamp((t.life - t.age) / (t.life * 0.35), 0, 1);
      const a = Math.min(fadeIn, fadeOut);
      // Subtle entry pop: scale overshoots past 1 (easeOutBack) then settles.
      const sc = t.scale * (0.6 + 0.4 * Tween.easeOutBack(fadeIn));

      const c = t.color;
      // Drop shadow first (offset 1px), then the colored glyph on top.
      draw_set_alpha(a * 0.7);
      draw_text_transformed_color(
        t.x + 1,
        y + 1,
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
      draw_text_transformed_color(t.x, y, t.text, sc, sc, 0, c, c, c, c, 1);
    }

    if (FloatingText.font !== -1) draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_alpha(alpha);
  }
};

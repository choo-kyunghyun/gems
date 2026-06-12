// Immediate-mode overlay draws for the platformer RPG demo. Scenes have no GUI-layer
// hook, so these draw in scene.draw() pinned to the camera's view rect (vx,vy,vw,vh
// = camera_get_view_* of the scene camera). The caller saves/restores draw state.
// Trimmed from TopDownUI: HP/level HUD (no quests) + a bag/equipment/stats panel
// (no quests, no persistent Records). The inventory is keyboard-driven (I toggles;
// Up/Down select; Enter equips/uses) — selection state + actions live in the scene.
globalThis.PlatformerUI = {
  _PANEL_BG: undefined, // lazily built (make_colour_rgb not allowed at top level)

  _bg() {
    if (this._PANEL_BG === undefined)
      this._PANEL_BG = make_colour_rgb(22, 22, 30);
    return this._PANEL_BG;
  },

  _rarityColor(itemId) {
    const it = Item.get(itemId);
    const r = it !== undefined ? Rarity.get(it.rarity) : undefined;
    return r !== undefined ? r.color : c_white;
  },

  _box(x1, y1, x2, y2) {
    draw_set_alpha(0.88);
    draw_set_color(this._bg());
    draw_rectangle(x1, y1, x2, y2, false);
    draw_set_alpha(1);
    draw_set_color(make_colour_rgb(90, 90, 110));
    draw_rectangle(x1, y1, x2, y2, true);
  },

  // World-space markers: item drops (rarity squares) + bullets (dots).
  drawWorld(scene) {
    const world = scene.world;

    const drops = world.query(ItemDrop, Position);
    for (const id of drops) {
      const p = world.get(Position, id);
      const d = world.get(ItemDrop, id);
      draw_set_color(this._rarityColor(d.itemId));
      draw_rectangle(p.x - 7, p.y - 7, p.x + 7, p.y + 7, false);
      draw_set_color(c_black);
      draw_rectangle(p.x - 7, p.y - 7, p.x + 7, p.y + 7, true);
    }

    const bullets = world.query(Projectile, Position);
    draw_set_color(make_colour_rgb(255, 230, 90));
    for (const id of bullets) {
      const p = world.get(Position, id);
      draw_circle(p.x, p.y, 3, false);
    }
    draw_set_color(c_white);
  },

  // Top-right HUD: level + HP.
  drawHud(scene, vx, vy, vw, vh) {
    const world = scene.world;
    const st = world.get(Stats, scene.ctrl.id);
    const hpC = world.get(Health, scene.ctrl.id);
    const hp = hpC !== undefined ? hpC.hp : 0;
    const x = vx + vw - 18;
    const y = vy + 16;

    draw_set_halign(fa_right);
    draw_set_valign(fa_top);
    draw_set_font(I18n.font("header"));
    draw_set_color(c_white);
    draw_text(x, y, I18n.text("PLAT_HUD", st.level, hp, st.maxHp));
  },

  // Centered bag + equipment + stats panel (toggled with I). Inventory rows show a
  // rarity swatch, name x qty, an "(equipped)" mark, and the rarity-scaled value.
  drawInventory(scene, vx, vy, vw, vh) {
    const world = scene.world;
    const cx = vx + vw / 2;
    const cy = vy + vh / 2;
    const x1 = cx - 220;
    const x2 = cx + 220;
    const y1 = cy - 250;
    const y2 = cy + 250;
    this._box(x1, y1, x2, y2);

    const lx = x1 + 22;
    let y = y1 + 18;

    draw_set_halign(fa_left);
    draw_set_valign(fa_top);
    draw_set_font(I18n.font("header"));
    draw_set_color(c_white);
    draw_text(lx, y, I18n.text("TOPDOWN_INVENTORY"));
    y += 30;

    draw_set_font(I18n.font("default"));
    const inv = world.get(Inventory, scene.ctrl.id);
    const eq = world.get(Equipment, scene.ctrl.id);
    draw_set_color(make_colour_rgb(180, 180, 180));
    let usage =
      I18n.text("TOPDOWN_SLOTS") + " " + inv.slots.length + "/" + inv.capacity;
    if (inv.maxWeight !== undefined) {
      usage +=
        "   " +
        I18n.text("TOPDOWN_WEIGHT") +
        " " +
        InventorySystem.weight(inv) +
        "/" +
        inv.maxWeight;
    }
    draw_text(lx, y, usage);
    y += 26;
    if (inv.slots.length === 0) {
      draw_set_color(make_colour_rgb(150, 150, 150));
      draw_text(lx, y, I18n.text("TOPDOWN_EMPTY"));
      y += 28;
    }
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      const it = Item.get(s.itemId);
      const selected = i === scene.invSel;
      if (selected) {
        draw_set_color(make_colour_rgb(70, 80, 110));
        draw_rectangle(lx - 6, y - 2, x2 - 16, y + 22, false);
      }
      draw_set_color(this._rarityColor(s.itemId));
      draw_rectangle(lx, y + 3, lx + 18, y + 21, false);
      draw_set_color(c_black);
      draw_rectangle(lx, y + 3, lx + 18, y + 21, true);
      const equippable = it !== undefined && it.hasComponent(Equippable);
      const prefix = selected ? "> " : "  ";
      const name = it !== undefined ? I18n.text(it.name) : s.itemId;
      let worn = false;
      if (equippable) {
        const eqp = it.getComponent(Equippable);
        worn = eq.slots[eqp.slot] === s.itemId;
      }
      const suffix = worn ? "  " + I18n.text("TOPDOWN_EQUIPPED") : "";
      draw_set_color(worn ? make_colour_rgb(255, 220, 120) : c_white);
      draw_text(lx + 28, y, prefix + name + "  x" + s.qty + suffix);
      const val =
        it !== undefined ? Math.round(Rarity.modify(it.rarity, it.value)) : 0;
      draw_set_color(make_colour_rgb(150, 150, 150));
      draw_set_halign(fa_right);
      draw_text(x2 - 22, y, "" + val);
      draw_set_halign(fa_left);
      y += 28;
    }

    // Equipment
    y += 12;
    draw_set_font(I18n.font("header"));
    draw_set_color(make_colour_rgb(255, 220, 120));
    draw_text(lx, y, I18n.text("TOPDOWN_EQUIPMENT"));
    y += 30;
    draw_set_font(I18n.font("default"));
    y = this._drawSlot(eq, "weapon", "SLOT_WEAPON", lx, y);
    y = this._drawSlot(eq, "armor", "SLOT_ARMOR", lx, y);
    y = this._drawSlot(eq, "trinket", "SLOT_TRINKET", lx, y);

    // Stats
    y += 12;
    const st = world.get(Stats, scene.ctrl.id);
    draw_set_font(I18n.font("header"));
    draw_set_color(make_colour_rgb(255, 220, 120));
    draw_text(lx, y, I18n.text("TOPDOWN_STATS"));
    y += 30;
    draw_set_font(I18n.font("default"));
    draw_set_color(c_white);
    draw_text(
      lx,
      y,
      I18n.text("STAT_LEVEL") +
        ": " +
        st.level +
        "   " +
        I18n.text("STAT_ATK") +
        ": " +
        st.attack +
        "   " +
        I18n.text("STAT_DEF") +
        ": " +
        st.defense +
        "   " +
        I18n.text("STAT_SPD") +
        ": " +
        Math.round(st.speed),
    );

    // Hint
    draw_set_font(I18n.font("description"));
    draw_set_color(make_colour_rgb(130, 130, 140));
    draw_text(lx, y2 - 24, I18n.text("PLAT_INV_HINT"));
  },

  // One equipment-slot row: "<Slot>: <item or empty>", tinted by item rarity.
  _drawSlot(eq, slot, labelKey, lx, y) {
    const itemId = eq !== undefined ? eq.slots[slot] : "";
    const equipped = itemId !== undefined && itemId !== "";
    let txt = I18n.text(labelKey) + ": ";
    if (equipped) {
      const it = Item.get(itemId);
      txt += it !== undefined ? I18n.text(it.name) : itemId;
      draw_set_color(this._rarityColor(itemId));
    } else {
      txt += I18n.text("SLOT_EMPTY");
      draw_set_color(make_colour_rgb(140, 140, 140));
    }
    draw_text(lx, y, txt);
    return y + 26;
  },
};

// Immediate-mode overlay draws for the TopDown RPG demo. Scenes have no GUI-layer
// hook, so these draw in scene.draw() pinned to the camera's view rect (vx,vy,vw,vh
// = camera_get_view_* of view_camera[0]). The caller saves/restores draw state.
// All panels are keyboard-driven (I = inventory, E = NPC interact) — no clicks.
globalThis.TopDownUI = {
  _PANEL_BG: undefined, // lazily built color (make_colour_rgb not allowed at top level)

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

  // Entities as colored boxes (placeholder — GMRT 0.19 can't render the SVG
  // character sprites). The box still reflects the Animator state: it inflates on
  // walk/attack, and a notch shows the facing Direction. Swap back to RenderEntity
  // once raster sprites exist (the Animator/Visual wiring is unchanged).
  drawEntities(scene) {
    const world = scene.world;
    const ids = world.query(Visual, Position, BBox);
    for (const id of ids) {
      const vis = world.get(Visual, id);
      if (!vis.visible) continue;

      const pos = world.get(Position, id);
      const prev = world.get(PrevPosition, id);
      const a = world.alpha;
      const cx = prev !== undefined ? prev.x + (pos.x - prev.x) * a : pos.x;
      const cy = prev !== undefined ? prev.y + (pos.y - prev.y) * a : pos.y;

      const box = world.get(BBox, id);
      const anim = world.get(Animator, id);
      let inflate = 0;
      if (anim !== undefined) {
        if (anim.state === "attack") inflate = 3;
        else if (anim.state === "walk") inflate = 1;
      }
      const x1 = cx + box.x - inflate;
      const y1 = cy + box.y - inflate;
      const x2 = cx + box.x + box.width + inflate;
      const y2 = cy + box.y + box.height + inflate;

      draw_set_alpha(vis.alpha);
      draw_set_color(vis.color);
      draw_rectangle(x1, y1, x2, y2, false);
      draw_set_alpha(1);
      draw_set_color(c_black);
      draw_rectangle(x1, y1, x2, y2, true);

      const dir = world.get(Direction, id);
      if (dir !== undefined && (dir.x !== 0 || dir.y !== 0)) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const r = (x2 - x1) / 2;
        draw_set_color(c_black);
        draw_circle(mx + dir.x * r * 0.6, my + dir.y * r * 0.6, 3, false);
      }
    }
    draw_set_color(c_white);
    draw_set_alpha(1);
  },

  // World-space markers: walls, item drops (rarity squares), bullets (dots), reach zone.
  drawWorld(scene) {
    const world = scene.world;

    // Walls = kinematic solids with no Visual (NPC/enemies have a Visual).
    const solids = world.query(Collision, BBox, Position);
    draw_set_color(make_colour_rgb(70, 74, 90));
    for (const id of solids) {
      const col = world.get(Collision, id);
      if (!col.solid || !col.kinematic) continue;
      if (world.get(Visual, id) !== undefined) continue;
      const e = AABB.of(world, id);
      draw_rectangle(e.x1, e.y1, e.x2, e.y2, false);
    }

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

    if (scene.reachZone !== undefined && !scene.reachDone) {
      const z = scene.reachZone;
      draw_set_alpha(0.35);
      draw_set_color(make_colour_rgb(120, 200, 255));
      draw_rectangle(z.x1, z.y1, z.x2, z.y2, false);
      draw_set_alpha(1);
    }
    draw_set_color(c_white);
  },

  drawHud(scene, vx, vy, vw, vh) {
    const world = scene.world;
    const st = world.get(Stats, scene.ctrl.id);
    const hpC = world.get(Health, scene.ctrl.id);
    const hp = hpC !== undefined ? hpC.hp : 0;
    const x = vx + vw - 18;
    let y = vy + 16;

    draw_set_halign(fa_right);
    draw_set_valign(fa_top);
    draw_set_font(I18n.font("header"));
    draw_set_color(c_white);
    draw_text(x, y, I18n.text("TOPDOWN_HUD", st.level, hp, st.maxHp));
    y += 34;

    draw_set_font(I18n.font("description"));
    const ids = QuestLog.activeIds();
    if (ids.length === 0) {
      draw_set_color(make_colour_rgb(150, 150, 150));
      draw_text(x, y, I18n.text("TOPDOWN_NO_QUEST"));
    }
    for (let i = 0; i < ids.length; i++) {
      const def = QuestLog.def(ids[i]);
      const status = QuestLog.status(ids[i]);
      const obj = def.objectives[0];
      draw_set_color(status.ready ? c_lime : c_white);
      draw_text(
        x,
        y,
        I18n.text(def.name) +
          "  " +
          I18n.text(def.objLabel, status.progress[0], obj.count),
      );
      y += 28;
    }
  },

  // Bottom-center dialogue box; shown by the scene while the player is near an NPC.
  drawDialogue(scene, vx, vy, vw, vh) {
    const cx = vx + vw / 2;
    const y2 = vy + vh - 20;
    const y1 = y2 - 110;
    const x1 = cx - 320;
    const x2 = cx + 320;
    this._box(x1, y1, x2, y2);

    draw_set_halign(fa_left);
    draw_set_valign(fa_top);
    draw_set_font(I18n.font("header"));
    draw_set_color(make_colour_rgb(255, 220, 120));
    draw_text(x1 + 18, y1 + 14, I18n.text(scene.dialogueName));

    draw_set_font(I18n.font("default"));
    draw_set_color(c_white);
    draw_text(x1 + 18, y1 + 48, I18n.text(scene.dialogueLine));

    if (scene.dialogueAction !== "") {
      draw_set_halign(fa_right);
      draw_set_color(c_lime);
      draw_text(x2 - 18, y2 - 30, "[E] " + I18n.text(scene.dialogueAction));
    }
  },

  // Centered bag + equipment + stats + records panel (toggled with I). Inventory
  // lines show a [n] hotkey when equippable and their rarity-scaled value at the
  // right edge; the Equipment section lists each slot's current item.
  drawInventory(scene, vx, vy, vw, vh) {
    const world = scene.world;
    const cx = vx + vw / 2;
    const cy = vy + vh / 2;
    const x1 = cx - 220;
    const x2 = cx + 220;
    const y1 = cy - 300;
    const y2 = cy + 300;
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
    // Slot + weight usage under the header.
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
      // Selection highlight bar behind the current row.
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
      // Mark the line if this item is the one currently worn in its slot.
      let worn = false;
      if (equippable) {
        const eqp = it.getComponent(Equippable);
        worn = eq.slots[eqp.slot] === s.itemId;
      }
      const suffix = worn ? "  " + I18n.text("TOPDOWN_EQUIPPED") : "";
      draw_set_color(worn ? make_colour_rgb(255, 220, 120) : c_white);
      draw_text(lx + 28, y, prefix + name + "  x" + s.qty + suffix);
      // Rarity-scaled value, right-aligned (display only — no currency yet).
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
        I18n.text("STAT_XP") +
        ": " +
        st.xp +
        "/" +
        st.xpNext,
    );
    y += 26;
    draw_text(
      lx,
      y,
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
    y += 36;

    // Records (persistent profile counters)
    draw_set_font(I18n.font("header"));
    draw_set_color(make_colour_rgb(255, 220, 120));
    draw_text(lx, y, I18n.text("TOPDOWN_RECORDS"));
    y += 30;
    draw_set_font(I18n.font("default"));
    draw_set_color(c_white);
    draw_text(
      lx,
      y,
      I18n.text("REC_KILLS") + ": " + Profile.get("enemiesKilled"),
    );
    y += 26;
    draw_text(
      lx,
      y,
      I18n.text("REC_ITEMS") + ": " + Profile.get("itemsCollected"),
    );
    y += 26;
    draw_text(
      lx,
      y,
      I18n.text("REC_QUESTS") + ": " + Profile.get("questsCompleted"),
    );

    // Hint
    draw_set_font(I18n.font("description"));
    draw_set_color(make_colour_rgb(130, 130, 140));
    draw_text(lx, y2 - 24, I18n.text("TOPDOWN_EQUIP_HINT"));
  },

  // One equipment-slot row: "<Slot>: <item or empty>", tinted by item rarity.
  // Returns the next y. Object-method → object-method via `this` is GMRT-safe.
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

  // Top-center achievement toast (scene drives toastTimer/toastName).
  drawToast(scene, vx, vy, vw, vh) {
    const cx = vx + vw / 2;
    const y1 = vy + 24;
    this._box(cx - 220, y1, cx + 220, y1 + 52);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);
    draw_set_font(I18n.font("header"));
    draw_set_color(make_colour_rgb(255, 215, 90));
    draw_text(
      cx,
      y1 + 26,
      I18n.text("TOPDOWN_UNLOCKED", I18n.text(scene.toastName)),
    );
  },
};

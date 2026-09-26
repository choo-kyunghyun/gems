// Core/UI cases: the live text refs, the style door, the scroll, the slot drag, the menu
// navigation and the GUI frame's costs. Every case references Core only.

Test.register(Test.CHECK, [
  {
    // each param resolves on its own, so values and getters mix in any order
    id: "i18n.textRef",
    setup(ctx) {
      ctx.n = 1;
    },
    verify(ctx, t) {
      const key = "TEST_ABSENT {0} {1} {2}"; // an absent key renders as itself
      const mixed = I18n.textRef(key, "a", () => "n" + ctx.n, "c");
      const lead = I18n.textRef(key, () => "n" + ctx.n, "b", "c");
      t.eq(mixed(), "TEST_ABSENT a n1 c", "a value leading a getter");
      t.eq(lead(), "TEST_ABSENT n1 b c", "a getter leading values");
      ctx.n = 2;
      t.eq(mixed(), "TEST_ABSENT a n2 c", "a getter re-resolves");
      t.eq(
        I18n.textRef(key, "a", "b", "c")(),
        "TEST_ABSENT a b c",
        "values alone",
      );
    },
  },
  {
    // a drop hook owns the outcome, so the carried item goes home; without one the cells swap
    id: "ui.slotDrop",
    setup(ctx) {
      ctx.drops = [];
      ctx.a = new UISlots({ items: [{ id: "x" }, null] });
      ctx.b = new UISlots({ items: [{ id: "y" }, null] });
      ctx.hooked = new UISlots({
        items: [{ id: "z" }, null],
        onDrop: (src, from, to) => ctx.drops.push([src, from, to]),
      });
    },
    verify(ctx, t) {
      SlotDrag.begin(ctx.a, 0);
      SlotDrag.drop(ctx.hooked, 1);
      t.eq(ctx.drops.length, 1, "the hook fires once");
      const d = ctx.drops[0];
      t.ok(d[0] === ctx.a && d[1] === 0 && d[2] === 1, "the hook names source, from and to");
      t.eq(ctx.a.items[0].id, "x", "the carried item goes home");
      t.eq(ctx.hooked.items[1], null, "the hooked grid is left to its owner");
      t.ok(!SlotDrag.active, "the drag ends");

      SlotDrag.begin(ctx.a, 0);
      SlotDrag.drop(ctx.b, 0);
      t.ok(ctx.a.items[0].id === "y" && ctx.b.items[0].id === "x", "a hookless grid swaps");

      const passive = new UISlots({ items: [null], passive: true });
      t.eq(passive.onUpdate(undefined, false), false, "a passive grid never takes the pointer");
    },
    teardown(ctx) {
      SlotDrag.cancel();
    },
  },
  {
    // a built-in setter handed over as a value styles the node, arguments intact, and reflows it
    id: "ui.style",
    setup(ctx) {
      ctx.el = new UIElement({ width: 10, height: 10 });
      ctx.root = new UIElement();
      ctx.root.insertChild(ctx.el);
      ctx.root.refresh();
    },
    verify(ctx, t) {
      ctx.el.style(flexpanel_node_style_set_width, 50, flexpanel_unit.point);
      t.ok(ctx.root.dirty, "a style dirties the tree");
      ctx.el.style(flexpanel_node_style_set_margin, flexpanel_edge.left, 8);
      ctx.root.refresh();
      const pos = ctx.el.getLayoutPosition();
      t.eq(pos.width, 50, "the setter lands");
      t.eq(pos.left, 8, "an edge setter's arguments pass through");
      ctx.el.setHeight(20, flexpanel_unit.point);
      ctx.root.refresh();
      t.eq(ctx.el.getLayoutPosition().height, 20, "a named setter goes through the same door");
    },
    teardown(ctx) {
      ctx.root.destroy();
    },
  },
  {
    // a viewport's wheel and thumb answer to what lies over it, never to a descendant's capture
    id: "ui.scrollAbove",
    setup(ctx) {
      Test.ui(ctx);
      ctx.body = new UIElement({ width: "100%", flexShrink: 0 });
      ctx.body.insertChild(new UIElement({ width: 100, height: 40 }).addComponent(new UIButton()));
      ctx.body.insertChild(new UIElement({ width: 100, height: 400 }));
      ctx.viewport = new UIElement({ width: 200, height: 100 });
      ctx.viewport.clip = true;
      ctx.viewport.insertChild(ctx.body);
      ctx.scroll = new UIScroll({ content: ctx.body });
      ctx.viewport.addComponent(ctx.scroll);
      ctx.cover = new UIElement({ width: 300, height: 300 }).addComponent(new UITrigger());
      UI.insert(ctx.viewport);
      UI.insert(ctx.cover);
    },
    verify(ctx, t) {
      const p = Input.pointer;
      const at = (x, y, wheel, press) => {
        p.x = x;
        p.y = y;
        p.wheel = wheel;
        p.left.pressed = press;
        p.left.down = press;
        Test.uiFrame(ctx, []);
      };
      at(50, 20, 1, false);
      t.eq(ctx.scroll.scroll, 0, "a root over the viewport keeps the wheel");
      at(190, 20, 0, true);
      t.ok(!ctx.scroll._bar.dragging, "and the thumb");
      at(190, 20, 0, false);

      UI.setEnabled(ctx.cover, false);
      at(50, 20, 1, false);
      t.ok(ctx.scroll.scroll > 0, "a hovered child leaves the wheel to its viewport");
      at(190, 20, 0, true);
      t.ok(ctx.scroll._bar.dragging, "the thumb grabs with nothing over it");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // a focus move reveals its target in the viewport around it, by the least scroll that does
    id: "ui.navReveal",
    setup(ctx) {
      Test.ui(ctx);
      ctx.body = new UIElement({ width: "100%", flexShrink: 0, gap: 10 });
      ctx.rows = [];
      for (let i = 0; i < 6; i++) {
        const row = new UIElement({ width: 100, height: 40 }).addComponent(new UIButton());
        ctx.body.insertChild(row);
        ctx.rows.push(row);
      }
      ctx.viewport = new UIElement({ width: 200, height: 100 });
      ctx.viewport.clip = true;
      ctx.viewport.insertChild(ctx.body);
      ctx.scroll = new UIScroll({ content: ctx.body });
      ctx.viewport.addComponent(ctx.scroll);
      UI.insert(ctx.viewport);
    },
    verify(ctx, t) {
      const inside = (el) => {
        const vp = ctx.viewport.getLayoutPosition();
        const p = el.getLayoutPosition();
        return p.top >= vp.top ? p.top + p.height <= vp.top + vp.height : false;
      };
      const last = ctx.rows[5];
      UINav.focus(last);
      t.ok(UINav.focused === last, "the focus moves");
      t.ok(inside(last), "a focus below the viewport scrolls into it");
      UINav.focus(ctx.rows[0]);
      t.eq(ctx.scroll.scroll, 0, "and one above scrolls back");

      UINav.engaged = true;
      Test.uiFrame(ctx, [vk_down]);
      Test.uiFrame(ctx, [vk_down]);
      Test.uiFrame(ctx, [vk_down]);
      t.ok(UINav.focused === ctx.rows[3], "the nav's own moves go through it");
      t.ok(inside(ctx.rows[3]), "and reveal their target");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // an idle frame drops a focus the walk would no longer gather — hidden, under a hidden
    // parent or root, unregistered or destroyed — and keeps one it would
    id: "ui.navReach",
    setup(ctx) {
      Test.ui(ctx);
      ctx.btn = new UIElement({ width: 100, height: 40 }).addComponent(new UIButton());
      ctx.group = new UIElement();
      ctx.group.insertChild(ctx.btn);
      ctx.root = new UIElement({ flexDirection: "column" });
      ctx.root.insertChild(ctx.group);
      UI.insert(ctx.root);
    },
    verify(ctx, t) {
      const btn = ctx.btn;
      const check = (hides, msg) => {
        UINav.focused = btn;
        Test.uiFrame(ctx, []);
        const walked = UINav._indexOf(UINav._collect(), btn) !== -1;
        t.ok(walked === !hides, msg + ": the walk");
        t.ok((UINav.focused === btn) === !hides, msg + ": the focus");
      };
      check(false, "a shown focus");
      btn.enabled = false;
      check(true, "a hidden focus");
      btn.enabled = true;
      ctx.group.enabled = false;
      check(true, "a hidden parent");
      ctx.group.enabled = true;
      UI.setEnabled(ctx.root, false);
      check(true, "a hidden root");
      UI.setEnabled(ctx.root, true);
      check(false, "a shown root");
      UI.remove(ctx.root);
      check(true, "an unregistered root");
      UI.insert(ctx.root, 0);
      check(false, "a registered root");
      ctx.group.removeChild(btn);
      btn.destroy();
      check(true, "a destroyed focus");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // the nearest focusable along the axis wins, a full-width row hands Down to the first in
    // visual order, a disabled item is never collected, and past an edge nothing is picked, not
    // even a wider row whose center lies that way
    id: "ui.navPick",
    setup(ctx) {
      Test.ui(ctx);
      const item = (w) =>
        new UIElement({ width: w, height: 40 }).addComponent(new UIButton());
      ctx.head = item(600);
      ctx.a = item(100);
      ctx.b = item(100);
      ctx.c = item(100);
      ctx.off = item(100);
      ctx.off.enabled = false;
      const row = new UIElement({ flexDirection: "row", gap: 20 });
      row.insertChild(ctx.a).insertChild(ctx.b).insertChild(ctx.c).insertChild(ctx.off);
      ctx.root = new UIElement({ width: 600, flexDirection: "column", gap: 20 });
      ctx.root.insertChild(ctx.head).insertChild(row);
      UI.insert(ctx.root);
    },
    verify(ctx, t) {
      const items = UINav._collect();
      t.eq(items.length, 4, "every enabled focusable is collected");
      t.eq(UINav._indexOf(items, ctx.off), -1, "a disabled item is never collected");
      const pick = (from, dx, dy) => {
        const j = UINav._pick(items, UINav._indexOf(items, from), dx, dy);
        return j === -1 ? null : items[j].el;
      };
      t.ok(pick(ctx.head, 0, 1) === ctx.a, "Down from a full-width row lands on its first");
      t.ok(pick(ctx.a, 1, 0) === ctx.b, "the nearest along the axis wins");
      t.ok(pick(ctx.c, 0, -1) === ctx.head, "Up reaches the row above");
      t.ok(pick(ctx.a, -1, 0) === null, "nothing past the left edge");
      t.ok(pick(ctx.c, 1, 0) === null, "a row's end never jumps to the wider row above");
      t.ok(pick(ctx.head, 0, -1) === null, "nothing past the top edge");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // Esc goes to its innermost owner, which spends it: a focused field blurs, and only then does
    // the nav let go of its ring
    id: "ui.navCancel",
    setup(ctx) {
      Test.ui(ctx);
      ctx.cancelled = 0;
      ctx.field = new UIInput({
        onCancel: () => {
          ctx.cancelled += 1;
        },
      });
      const fieldEl = new UIElement({ width: 200, height: 40 }).addComponent(ctx.field);
      UI.insert(fieldEl);
      ctx.field.focus(fieldEl);
      UINav.engaged = true;
    },
    verify(ctx, t) {
      Test.uiFrame(ctx, [vk_escape]);
      t.eq(ctx.cancelled, 1, "the first Esc ends the field's editing");
      t.ok(UINav.engaged, "the field's Esc never reaches the nav");
      t.eq(ctx.backs, 0, "nor back");

      Test.uiFrame(ctx, [vk_escape]);
      t.ok(!UINav.engaged, "the next Esc lets go of the ring");
      t.eq(ctx.backs, 1, "and falls to back");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // an event climbs from the focused element through its ancestors until one takes it, and only
    // an untaken one moves the focus or lets go of the ring
    id: "ui.navBubble",
    setup(ctx) {
      Test.ui(ctx);
      ctx.log = [];
      ctx.takes = {};
      const hook = (name, focusable) => ({
        focusable,
        onNav: (el, ev) => {
          ctx.log.push(name + ":" + ev.kind);
          return ctx.takes[name] === true;
        },
      });
      const item = (name) =>
        new UIElement({ width: 200, height: 40 }).addComponent(hook(name, true));
      ctx.a = item("a");
      ctx.b = item("b");
      ctx.select = new UISelect({ items: [{ name: "x" }, { name: "y" }, { name: "z" }] });
      ctx.sel = new UIElement({ width: 200, height: 40 }).addComponent(ctx.select);
      ctx.list = new UIElement({ width: 200, flexDirection: "column", gap: 20 });
      ctx.list.addComponent(hook("list", false));
      ctx.list.insertChild(ctx.a).insertChild(ctx.b).insertChild(ctx.sel);
      UI.insert(ctx.list);
      UINav.focused = ctx.a;
      UINav.engaged = true;
    },
    verify(ctx, t) {
      const step = (keys) => {
        ctx.log = [];
        Test.uiFrame(ctx, keys);
        return ctx.log.join(" ");
      };
      t.eq(UINav._indexOf(UINav._collect(), ctx.list), -1, "a hook alone is no focus stop");

      t.eq(step([vk_down]), "a:move list:move", "an untaken move climbs every ancestor");
      t.ok(UINav.focused === ctx.b, "then the nav moves the focus");

      ctx.takes.b = true;
      t.eq(step([vk_up]), "b:move", "a taken event stops where it is taken");
      t.ok(UINav.focused === ctx.b, "and the focus stays");
      ctx.takes.b = false;

      ctx.takes.list = true;
      t.eq(step([vk_escape]), "b:cancel list:cancel", "a cancel climbs too");
      t.ok(UINav.engaged, "a taken cancel keeps the ring");
      ctx.takes.list = false;
      step([vk_escape]);
      t.ok(!UINav.engaged, "an untaken cancel lets go of the ring");

      UINav.focused = ctx.sel;
      UINav.engaged = true;
      t.eq(step([vk_right]), "", "a focused widget takes the event before its ancestors");
      t.eq(ctx.select.getIndex(), 1, "a select's horizontal move adjusts rather than moves");
      step([vk_enter]);
      t.eq(ctx.select.getIndex(), 2, "and its confirm advances");
      t.ok(UINav.focused === ctx.sel, "neither moves the focus");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // a confirm puts a grid or a table in browse mode, which takes every nav event until a cancel
    // or the pointer hands control back; the nav clicks on each confirm and stays silent on moves
    id: "ui.navBrowse",
    setup(ctx) {
      Test.ui(ctx);
      ctx.picked = [];
      ctx.used = [];
      ctx.slots = new UISlots({
        items: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, null, { id: "f" }],
        cols: 3,
        onSelect: (i) => ctx.picked.push(i),
        onActivate: (i) => ctx.used.push(i),
      });
      ctx.grid = new UIElement({ width: 208, height: 136 }).addComponent(ctx.slots);
      ctx.rows = [{ n: 1 }, { n: 2 }, { n: 3 }];
      ctx.table = new UITable({
        columns: [{ label: "N", text: (r) => string(r.n), sortValue: (r) => r.n }],
        rows: ctx.rows,
        onSelect: (r) => ctx.picked.push("r" + r.n),
        onActivate: (r) => ctx.used.push("r" + r.n),
      });
      ctx.tableEl = new UIElement({ width: 300, height: 114 }).addComponent(ctx.table);
      const root = new UIElement({ flexDirection: "column", gap: 20 });
      root.insertChild(ctx.grid).insertChild(ctx.tableEl);
      UI.insert(root);
      UINav.focused = ctx.grid;
      UINav.engaged = true;
    },
    verify(ctx, t) {
      Test.uiFrame(ctx, [vk_enter]);
      t.eq(ctx.sounds, 1, "entering browse clicks");
      Test.uiFrame(ctx, [vk_right]);
      Test.uiFrame(ctx, [vk_down]);
      t.eq(ctx.picked.join(","), "1,4", "moves step the slot cursor, a row by the columns");
      t.ok(UINav.focused === ctx.grid, "browse keeps the focus");
      t.eq(ctx.sounds, 1, "a browse move is silent");
      Test.uiFrame(ctx, [vk_enter]);
      t.eq(ctx.used.join(","), "4", "a confirm activates the cursor slot");
      t.eq(ctx.sounds, 2, "and clicks");
      Test.uiFrame(ctx, [vk_escape]);
      t.ok(UINav.engaged, "the Esc that leaves browse keeps the ring");
      Test.uiFrame(ctx, [vk_down]);
      t.ok(UINav.focused === ctx.tableEl, "out of browse a move leaves the grid");

      ctx.picked = [];
      ctx.used = [];
      Test.uiFrame(ctx, [vk_enter]);
      Test.uiFrame(ctx, [vk_down]);
      t.eq(ctx.picked.join(","), "r2", "a table's move steps the row cursor");
      Test.uiFrame(ctx, [vk_enter]);
      t.eq(ctx.used.join(","), "r2", "a table's confirm activates the cursor row");

      Input.pointer.x += 1;
      Input.pointer.moved = true;
      Test.uiFrame(ctx, []);
      Input.pointer.moved = false;
      t.ok(!ctx.table._browsing, "a pointer move ends the table's browse");
      Test.uiFrame(ctx, [vk_up]); // re-engages the ring the move let go of
      Test.uiFrame(ctx, [vk_up]);
      t.ok(UINav.focused === ctx.grid, "and hands the table back to the nav");

      Test.uiFrame(ctx, [vk_enter]);
      t.ok(ctx.slots._browsing, "the grid browses again");
      UINav.focus(ctx.tableEl);
      Test.uiFrame(ctx, []);
      t.ok(!ctx.slots._browsing, "a focus that leaves a browse ends it");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // editing holds the nav focus: a confirm or a click starts it, the field then takes every nav
    // event — a pad confirm commits as Enter does — and a field that loses the focus stops
    id: "ui.navField",
    setup(ctx) {
      Test.ui(ctx);
      ctx.confirmed = 0;
      ctx.field = new UIInput({
        onConfirm: () => {
          ctx.confirmed += 1;
        },
      });
      ctx.fieldEl = new UIElement({ width: 200, height: 40 }).addComponent(ctx.field);
      ctx.after = new UIElement({ width: 200, height: 40 }).addComponent(new UIButton());
      const root = new UIElement({ flexDirection: "column", gap: 20 });
      root.insertChild(ctx.fieldEl).insertChild(ctx.after);
      UI.insert(root);
      UINav.focused = ctx.fieldEl;
      UINav.engaged = true;
    },
    verify(ctx, t) {
      Test.uiFrame(ctx, [vk_enter]);
      Test.uiFrame(ctx, [], [], "ab");
      t.eq(ctx.field.value, "ab", "a nav confirm starts editing");
      Test.uiFrame(ctx, [], [gp_padd]);
      t.ok(UINav.focused === ctx.fieldEl, "a pad move never leaves an editing field");
      Test.uiFrame(ctx, [], [gp_face1]);
      Test.uiFrame(ctx, [], [], "c");
      t.eq(ctx.confirmed, 1, "a pad confirm commits the field");
      t.eq(ctx.field.value, "ab", "and ends its editing");
      Test.uiFrame(ctx, [vk_down]);
      t.ok(UINav.focused === ctx.after, "out of editing a move leaves the field");

      const pos = ctx.fieldEl.getLayoutPosition();
      Input.pointer.x = pos.left + 4;
      Input.pointer.y = pos.top + 4;
      Input.pointer.left.pressed = true;
      Test.uiFrame(ctx, []);
      Input.pointer.left.pressed = false;
      Input.pointer.x = -100000;
      Input.pointer.y = -100000;
      t.ok(UINav.focused === ctx.fieldEl, "a click hands the field the focus");
      Test.uiFrame(ctx, [], [], "d");
      t.eq(ctx.field.value, "dab", "and starts editing at the caret");

      UINav.focused = ctx.after;
      Test.uiFrame(ctx, [], [], "e");
      t.eq(ctx.field.value, "dab", "a field that loses the focus stops editing");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // a cancel the UI leaves falls to `back`, which alone hears it while the nav is suspended, and
    // only a taken cancel is spent
    id: "ui.navBack",
    setup(ctx) {
      Test.ui(ctx);
      UI.insert(new UIElement({ width: 200, height: 40 }).addComponent(new UIButton()));
    },
    verify(ctx, t) {
      Test.uiFrame(ctx, [vk_escape]);
      t.eq(ctx.backs, 1, "with no focus a cancel falls to back");
      t.ok(Input.keyPressed(vk_escape), "and stays for later readers while back declines it");
      ctx.backTakes = true;
      Test.uiFrame(ctx, [vk_escape]);
      t.ok(!Input.keyPressed(vk_escape), "a cancel back takes is spent");
      ctx.backTakes = false;

      UINav.suspended = true;
      ctx.backs = 0;
      Test.uiFrame(ctx, [vk_escape]);
      t.eq(ctx.backs, 1, "a suspended nav still hands the cancel to back");
      ctx.backTakes = true;
      Test.uiFrame(ctx, [], [gp_face2]);
      t.ok(!Input.padPressed(gp_face2), "and spends what back takes");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // an armed rebind row takes the Esc that disarms it before back can
    id: "ui.navCapture",
    setup(ctx) {
      Test.ui(ctx);
      ctx.row = new UIElement({ width: 200, height: 40 }).addComponent(
        new UIRebind({ actionKey: "test_absent" }),
      );
      UI.insert(ctx.row);
      UINav.focused = ctx.row;
      UINav.engaged = true;
    },
    verify(ctx, t) {
      Test.uiFrame(ctx, [vk_enter]);
      Test.uiFrame(ctx, [vk_escape]);
      t.eq(ctx.backs, 0, "an armed row takes the Esc that disarms it");
      Test.uiFrame(ctx, [vk_escape]);
      t.eq(ctx.backs, 1, "a disarmed row leaves the next Esc to back");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // an inline list opens after its field and leaves on a pick, a cancel from inside it, or a
    // press outside both, handing a focus inside it back to the field
    id: "ui.dropdown",
    setup(ctx) {
      Test.ui(ctx);
      ctx.host = new UIElement({ width: 200 });
      ctx.field = new UIElement({ width: 200, height: 40 });
      ctx.list = new UIElement({ width: 200 });
      ctx.row = new UIElement({ width: 200, height: 40 }).addComponent(new UIButton());
      ctx.list.insertChild(ctx.row);
      ctx.dd = new UIDropdown({
        items: [
          { name: "a", value: 1 },
          { name: "b", value: 2 },
        ],
        list: ctx.list,
      });
      ctx.field.addComponent(ctx.dd);
      ctx.host.insertChild(ctx.field);
      ctx.host.insertChild(new UIElement({ width: 200, height: 40 }));
      UI.insert(ctx.host);
    },
    verify(ctx, t) {
      const confirm = { kind: "confirm", dx: 0, dy: 0 };
      t.ok(ctx.dd.onNav(ctx.field, confirm), "a confirm on the field is taken");
      t.ok(ctx.host.children[1] === ctx.list, "and opens the list right after the field");
      t.ok(ctx.dd.onNav(ctx.field, confirm) ? ctx.list.parent === null : false, "a second closes it");

      ctx.dd.onNav(ctx.field, confirm);
      UINav.focused = ctx.row;
      UINav.engaged = true;
      Test.uiFrame(ctx, [vk_escape]);
      t.ok(ctx.list.parent === null, "a cancel from inside the list closes it");
      t.ok(UINav.focused === ctx.field, "and hands the focus back to the field");
      t.ok(ctx.backs === 0 ? !Input.keyPressed(vk_escape) : false, "a cancel it takes is spent");

      ctx.dd.onNav(ctx.field, confirm);
      Input.pointer.left.pressed = true;
      Test.uiFrame(ctx, []);
      Input.pointer.left.pressed = false;
      t.ok(ctx.list.parent === null, "a press outside field and list closes it");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
  {
    // a widget acts on the nav events it takes, and leaves to the nav what it cannot act on
    id: "ui.navWidgets",
    setup(ctx) {
      ctx.clicks = 0;
      ctx.toggles = 0;
      ctx.els = [];
      ctx.el = () => {
        const e = new UIElement({ width: 100, height: 40 });
        ctx.els.push(e);
        return e;
      };
    },
    verify(ctx, t) {
      const confirm = { kind: "confirm", dx: 0, dy: 0 };
      const right = { kind: "move", dx: 1, dy: 0 };
      const down = { kind: "move", dx: 0, dy: 1 };
      const el = ctx.el();

      const button = new UIButton({
        onClick: () => {
          ctx.clicks += 1;
        },
      });
      t.ok(button.onNav(el, confirm) ? ctx.clicks === 1 : false, "a button's confirm clicks it");
      t.ok(!button.onNav(el, right), "a button leaves the moves");
      button.disabled = true;
      t.ok(!button.onNav(el, confirm), "a disabled button leaves the confirm");

      const box = new UICheckbox({
        onToggle: () => {
          ctx.toggles += 1;
        },
      });
      t.ok(box.onNav(el, confirm) ? ctx.toggles === 1 : false, "a checkbox's confirm toggles it");
      box.readOnly = true;
      t.ok(!box.onNav(el, confirm), "a read-only checkbox leaves the confirm");

      const slider = new UISlider({ min: 0, max: 10, value: 5, step: 1 });
      t.ok(slider.onNav(el, right) ? slider.value === 6 : false, "a slider's side move nudges it");
      t.ok(!slider.onNav(el, down), "a slider leaves the vertical move");
      slider.readOnly = true;
      t.ok(!slider.onNav(el, right), "a read-only slider leaves the side move");

      const stepper = new UIStepper({ min: 0, max: 3, value: 1 });
      t.ok(stepper.onNav(el, right) ? stepper.value === 2 : false, "a stepper's side move steps it");

      const tabs = new UITabs({
        tabs: [
          { label: "a", content: ctx.el() },
          { label: "b", content: ctx.el() },
        ],
      });
      t.ok(tabs.onNav(el, right) ? tabs.index === 1 : false, "a tab strip's side move switches");
      t.ok(tabs.onNav(el, confirm) ? tabs.index === 0 : false, "and its confirm cycles");

      const header = ctx.el();
      ctx.el().insertChild(header);
      const acc = new UIAccordion({ body: ctx.el() });
      t.ok(acc.onNav(header, confirm) ? acc.expanded : false, "an accordion's confirm toggles it");
    },
    teardown(ctx) {
      for (let i = ctx.els.length - 1; i >= 0; i--) ctx.els[i].destroy();
    },
  },
  // perf.ui: a GUI frame's fixed costs over a tree of labelled buttons, gross — `ui.update` per
  // node, `nav.idle` (a frame with a focus and no input) and `nav.collect` (the focus walk) per
  // focusable, `ui.rect` per layout read. `children.copy` against `children.loop` is the tree
  // walk's per-child step, a copied reversed array against a reverse index loop.
  {
    id: "perf.ui",
    setup(ctx) {
      Test.ui(ctx);
      ctx.buttons = [];
      const root = new UIElement({ flexDirection: "column" });
      for (let i = 0; i < UI_BUTTONS; i++) {
        const b = new UIElement({ width: 200, height: 8 })
          .addComponent(new UIPanel())
          .addComponent(new UIButton());
        b.insertChild(new UIElement().addComponent(new UIText({ textRef: () => "x" })));
        root.insertChild(b);
        ctx.buttons.push(b);
      }
      ctx.nodes = 1 + UI_BUTTONS * 2;
      UI.insert(root);
      UI.update(); // settles each label's measured size
      UINav.focused = ctx.buttons[0];
      UINav.engaged = true;
      ctx.lists = [];
      for (let k = 0; k < UI_BUTTONS; k++) {
        const list = [];
        for (let i = 0; i < 8; i++) list.push({ v: i });
        ctx.lists.push(list);
      }
    },
    verify(ctx, t) {
      const frames = 20;
      const none = () => 0;
      t.measure("ui.update", frames * ctx.nodes, none, () => {
        for (let f = 0; f < frames; f++) UI.update();
        return UI.roots.length;
      });
      t.measure("nav.idle", frames * UI_BUTTONS, none, () => {
        for (let f = 0; f < frames; f++) UINav.update();
        return UINav.focused;
      });
      t.measure("nav.collect", frames * UI_BUTTONS, none, () => {
        let s = 0;
        for (let f = 0; f < frames; f++) s += UINav._collect().length;
        return s;
      });
      const buttons = ctx.buttons;
      t.measure("ui.rect", frames * UI_BUTTONS, none, () => {
        let s = 0;
        for (let f = 0; f < frames; f++)
          for (let i = 0; i < buttons.length; i++) s += buttons[i].getLayoutPosition().top;
        return s;
      });
      const lists = ctx.lists;
      const n = lists.length * 8;
      t.measure("children.copy", n, none, () => {
        let s = 0;
        for (let k = 0; k < lists.length; k++)
          [...lists[k]].reverse().forEach((c) => {
            s += c.v;
          });
        return s;
      });
      t.measure("children.loop", n, none, () => {
        let s = 0;
        for (let k = 0; k < lists.length; k++) {
          const list = lists[k];
          for (let i = list.length - 1; i >= 0; i--) s += list[i].v;
        }
        return s;
      });
      t.ok(UINav.focused === buttons[0], "an idle nav keeps its focus");
    },
    teardown(ctx) {
      Test.uiRestore(ctx);
    },
  },
]);

const UI_BUTTONS = 100; // perf.ui's tree: one labelled button per row

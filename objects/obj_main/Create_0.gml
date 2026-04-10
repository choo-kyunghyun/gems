var _top = new UIElement({ width: "100%", height: "10%", paddingHorizontal: 20 }).insert_child(new UIText({}, { textRef: i18n.get_text_ref("GameMaker Entity & Map System"), font: i18n.get_font("bold") }));
var _body = new UIElement({ width: "100%", height: "90%", flexDirection: "row" });
var _menu = new UIPanel({ width: "80%", height: "100%", flexWrap: "wrap", gap: 16 }, { colour: ASTOLFO_BLACK_D });
var _aside = new UIPanel({ width: "20%", height: "100%", flexDirection: "column", justifyContent: "space-around", alignItems: "center" }, { colour: ASTOLFO_BLACK });
self.ui = demo_ui_root().set_padding(flexpanel_edge.all_edges, 32).insert_child(_top).insert_child(_body);
_body.insert_child(_menu).insert_child(_aside);

_aside.insert_child(new UIImage({ width: "75%", height: "20%" }, { sprite: spr_choo, fit: OBJECT_FIT.CONTAIN }));
_aside.insert_child(demo_ui_button_aside(function() { url_open("https://github.com/choo-kyunghyun/gems"); }, "Repository"));
_aside.insert_child(demo_ui_button_aside(game_end, "END"));

_menu.insert_child(demo_ui_button_play(function() { room_goto(rm_demo_cjk); }, "CJK", "TTF font test"));

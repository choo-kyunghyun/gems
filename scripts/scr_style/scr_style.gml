#macro FONT_REGULAR_24 I18n.get_font("normal_24")
#macro FONT_BOLD_24 I18n.get_font("bold_24")
#macro FONT_REGULAR_36 I18n.get_font("normal_36")
#macro FONT_BOLD_36 I18n.get_font("bold_36")

#macro COLOR_WHITE #ffffff
#macro COLOR_BG #3e3546
#macro COLOR_PRIMARY #fdcbb0

function style_title_button(_text) {
    var _btn = new UITrigger({}, {

    });
    var _txt = new UIText({}, { text_ref: I18n.get_text_ref(_text), font: FONT_REGULAR_32, color: COLOR_PRIMARY });
    _btn.insert_child(_txt);
    return _btn;
}

function style_title() {
    var _title = new UIElement({ width: "100%", height: "100%" });
    var _copy = new UIText({}, { font: FONT_REGULAR_24, text_ref: function() { return "(c) Choo Kyunghyun"; }, color: COLOR_PRIMARY });
    _title.insert_child(_copy);

    var _main = new UIElement({ flex: 1, justifyContent: "center", alignItems: "center" });
    var _logo = new UIImage({ height: rem(6), aspectRatio: 1, alignSelf: "center" }, { sprite: spr_choo, color: COLOR_PRIMARY });
    
    _main.insert_child(_logo);
    _title.insert_child(_main);

    var _menu = new UIElement({
        height: rem(6),
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-evenly"
    });
    _title.insert_child(_menu);

    var _guide = new UIElement();
    _title.insert_child(_guide);
    
    return _title;
}

function style_terminal() {
    var _window = new UIPanel({ padding: rem(1), paddingBottom: rem(3.5) }, { color: COLOR_PRIMARY });
    var _window_i = new UIPanel({ padding: 4 }, { color: COLOR_BG });
    _window.insert_child(_window_i);


    return _window;
}

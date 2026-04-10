self.ui = demo_ui_button_main();
self.ui.mark_dirty();
self.ui.set_margin(flexpanel_edge.all_edges, 64);

self.w = display_get_gui_width() - 128;
self.kor = "";
repeat(250) {
    self.kor += chr(irandom_range(0xac00, 0xd7ac)) + " ";
}

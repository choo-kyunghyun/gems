// Inherit the parent event
event_inherited();

self.w = display_get_gui_width() - 128;
self.chars = 250;

var _start = get_timer();
self.kor = "";
repeat(self.chars) {
    self.kor += chr(irandom_range(0xac00, 0xd7ac)) + " ";
}
self.elapsed = get_timer() - _start;

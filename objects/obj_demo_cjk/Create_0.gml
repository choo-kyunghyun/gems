// Inherit the parent event
event_inherited();

self.pangram = "다람쥐 헌 쳇바퀴에 타고파";
self.main.insert_child(new UIText({}, { text_ref: method(self, function() { return self.pangram; }) }));

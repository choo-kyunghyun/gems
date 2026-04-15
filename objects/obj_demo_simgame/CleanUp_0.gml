/// CleanUp Event

// Inherit the parent event
event_inherited();

if (is_struct(self.world)) {
	self.world.destroy();
	self.world = undefined;
}

if (is_struct(self.camera)) {
	self.camera.destroy();
	self.camera = undefined;
}

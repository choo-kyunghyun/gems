/// Draw Event

// Inherit the parent event
event_inherited();

if (is_struct(self.world) && is_struct(self.world_renderer)) {
	self.world_renderer.draw(self.world, self.camera);
}

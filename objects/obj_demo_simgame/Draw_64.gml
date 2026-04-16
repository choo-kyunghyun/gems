/// DrawGUI Event

if (is_struct(self.world)) {
	draw_set_halign(fa_left);
	draw_set_valign(fa_top);
	draw_set_colour(ASTOLFO_WHITE);
	draw_text(24, 24, $"SIMGAME\nActors: {self.world.actor_manager.count()}\nActive(LOD0): {self.active_count}\nLOD reduced: {self.lod_count}\nTick: {self.world.tick}\nNavVersion: {self.world.mp.get_version()}\nPathRequests: {self.world.mp.count_requests()}\nCamera: {(self.camera_follow ? "FOLLOW" : "FREE")}\nQ: Spawn 10\nE: Despawn 10\nR: Rebuild Obstacles\nC: Toggle Camera Mode\nWASD/Arrows: Move Camera (FREE)");
}

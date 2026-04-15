function CameraFollow(_cam = {}) : Camera(_cam) constructor {
    self.follow_target = _cam[$ "follow_target"] ?? -1;
    self.follow_lerp = _cam[$ "follow_lerp"] ?? 0.1;
    self.look_distance = _cam[$ "look_distance"] ?? 64;
    self.projection = CAMERA_PROJECTION.PERSPECTIVE_FOV;

    static on_update = function() {
        if (!instance_exists(self.follow_target)) return;
        var _x = lerp(self.to_x, self.follow_target.x, self.follow_lerp);
        var _y = lerp(self.to_y, self.follow_target.y, self.follow_lerp);
        var _z = lerp(self.to_z, self.follow_target.depth, self.follow_lerp);
        self.set_from(_x, _y, _z + self.look_distance);
        self.set_to(_x, _y, _z);
    }
}

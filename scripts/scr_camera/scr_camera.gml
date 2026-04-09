function Camera() constructor {
    self.id = camera_create();
    self.x = 0;
    self.y = 0;
    self.z = 0;
    self.width = 640;
    self.height = 360;
    self.znear = 1;
    self.zfar = 32000;
    self.fov = 70;
    self.smoothness = 0.1;
    self.distance = 64;
    self.update = function() {
        var _view = matrix_build_lookat(self.x, self.y, self.z, self.x, self.y, self.z + self.distance, 0, 1, 0);
        var _proj = matrix_build_projection_perspective_fov(self.fov, self.width / self.height, self.znear, self.zfar);
        camera_set_view_mat(self.id, _view);
        camera_set_proj_mat(self.id, _proj);
        camera_apply(self.id);
    }
    
    static move = function(_x, _y, _z) {
        self.x = _x;
        self.y = _y;
        self.z = _z;
    }
    
    static follow = function(_x, _y) {
        self.x = lerp(self.x, _x, self.smoothness);
        self.y = lerp(self.y, _y, self.smoothness);
    }
    
    static set_default = function() {
        camera_set_default(self.id);
        view_camera[0] = self.id;
    }
}

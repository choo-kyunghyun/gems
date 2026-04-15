enum CAMERA_PROJECTION {
    ORTHO,
    PERSPECTIVE,
    PERSPECTIVE_FOV,
}

function Camera(_cam = {}) constructor {
    self.id = camera_create();
    self.from_x = _cam[$ "from_x"] ?? _cam[$ "x"] ?? 0;
    self.from_y = _cam[$ "from_y"] ?? _cam[$ "y"] ?? 0;
    self.from_z = _cam[$ "from_z"] ?? _cam[$ "z"] ?? 0;
    self.to_x = _cam[$ "to_x"] ?? self.from_x;
    self.to_y = _cam[$ "to_y"] ?? self.from_y;
    self.to_z = _cam[$ "to_z"] ?? self.from_z;
    self.up_x = _cam[$ "up_x"] ?? 0;
    self.up_y = _cam[$ "up_y"] ?? 1;
    self.up_z = _cam[$ "up_z"] ?? 0;
    self.width = _cam[$ "width"] ?? 640;
    self.height = _cam[$ "height"] ?? 360;
    self.znear = _cam[$ "znear"] ?? 1;
    self.zfar = _cam[$ "zfar"] ?? 32000;
    self.fov = _cam[$ "fov"] ?? 70;
    self.projection = _cam[$ "projection"] ?? CAMERA_PROJECTION.ORTHO;
    self.viewport = _cam[$ "viewport"] ?? -1;
    self.assigned = false;
    
    static on_update = function() {}

    static destroy = function() {
        self.unassign();
        if (self.id != -1) camera_destroy(self.id);
        self.id = -1;
    }

    static update = function() {
        self.on_update();
        var _view = matrix_build_lookat(self.from_x, self.from_y, self.from_z, self.to_x, self.to_y, self.to_z, self.up_x, self.up_y, self.up_z);
        var _proj = matrix_build_identity();
        switch (self.projection) {
            case CAMERA_PROJECTION.ORTHO:
                _proj = matrix_build_projection_ortho(self.width, self.height, self.znear, self.zfar);
                break;
            case CAMERA_PROJECTION.PERSPECTIVE:
                _proj = matrix_build_projection_perspective(self.width, self.height, self.znear, self.zfar);
                break;
            case CAMERA_PROJECTION.PERSPECTIVE_FOV:
                _proj = matrix_build_projection_perspective_fov(self.fov, self.width / self.height, self.znear, self.zfar);
                break;
        }
        camera_set_view_mat(self.id, _view);
        camera_set_proj_mat(self.id, _proj);
        if (self.assigned) camera_apply(self.id);
    }

    static assign = function(_viewport = 0) {
        self.viewport = _viewport;
        self.assigned = true;
        view_enabled = true;
        view_visible[_viewport] = true;
        view_camera[_viewport] = self.id;
    }

    static unassign = function() {
        if (self.assigned) view_camera[self.viewport] = -1;
        self.assigned = false;
        self.viewport = -1;
    }

    static set_from = function(_x, _y, _z) {
        self.from_x = _x;
        self.from_y = _y;
        self.from_z = _z;
    }

    static set_to = function(_x, _y, _z) {
        self.to_x = _x;
        self.to_y = _y;
        self.to_z = _z;
    }

    static set_up = function(_x, _y, _z) {
        self.up_x = _x;
        self.up_y = _y;
        self.up_z = _z;
    }

    static set_size = function(_width, _height) {
        self.width = _width;
        self.height = _height;
    }
}

function WorldRenderer() constructor {
    self.passes = [];

    static count = function() {
        return array_length(self.passes);
    }

    static at = function(_index) {
        if (_index < 0 || _index >= array_length(self.passes)) return undefined;
        return self.passes[_index];
    }

    static insert = function(_pass, _index = array_length(self.passes)) {
        if (!is_struct(_pass)) return self;
        array_insert(self.passes, _index, _pass);
        return self;
    }

    static remove = function(_pass_or_index) {
        var _index = -1;
        if (is_real(_pass_or_index)) {
            _index = _pass_or_index;
        } else {
            for (var _i = 0; _i < array_length(self.passes); _i++) {
                if (self.passes[_i] == _pass_or_index) {
                    _index = _i;
                    break;
                }
            }
        }

        if (_index >= 0 && _index < array_length(self.passes)) {
            array_delete(self.passes, _index, 1);
        }

        return self;
    }

    static clear = function() {
        self.passes = [];
        return self;
    }

    static destroy = function() {
        for (var _i = 0; _i < array_length(self.passes); _i++) {
            var _pass = self.passes[_i];
            if (is_struct(_pass)) _pass.destroy();
        }
        self.clear();
    }

    static prepare = function(_world, _camera) {
        for (var _i = 0; _i < array_length(self.passes); _i++) {
            var _pass = self.passes[_i];
            if (is_struct(_pass)) _pass.prepare(_world, _camera);
        }
    }

    static draw = function(_world, _camera) {
        for (var _i = 0; _i < array_length(self.passes); _i++) {
            var _pass = self.passes[_i];
            if (is_struct(_pass)) _pass.draw(_world, _camera);
        }
    }
}

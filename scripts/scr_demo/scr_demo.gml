function demo_load(_obj) {
    room_goto(rm_demo);
    call_later(1, time_source_units_frames, method({ object: _obj }, function() { obj_gems.level = instance_create_depth(0, 0, 0, self.object); }));
}

function demo_close() {
    if (instance_exists(obj_gems.level)) instance_destroy(obj_gems.level);
    room_goto(rm_lobby);
}

function demo_load_entity(_key) {
    var _reference = obj_gems.entities[$ _key];
    if (_reference == undefined) return undefined;
    var _entity = new Entity(_reference);
    return _entity;
}

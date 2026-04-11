#macro ASTOLFO_APRICOT #fdeddd
#macro ASTOLFO_PURPLE #ea8da2
#macro ASTOLFO_PURPLE_D #894b79
#macro ASTOLFO_PINK #f6bbad
#macro ASTOLFO_PINK_D #ac6371
#macro ASTOLFO_BLACK #4d514a
#macro ASTOLFO_BLACK_D #36362e
#macro ASTOLFO_WHITE #fcfbfc
#macro ASTOLFO_WHITE_D #ab9a90
#macro ASTOLFO_RED #c75459
#macro ASTOLFO_RED_D #882f3a
#macro ASTOLFO_GOLD #f9d061
#macro ASTOLFO_GOLD_D #aa642d

function demo_load(_obj) {
    room_goto(rm_demo);
    call_later(1, time_source_units_frames, method({ object: _obj }, function() { obj_demo.level = instance_create_depth(0, 0, 0, self.object); }));
}

function demo_close() {
    if (instance_exists(obj_demo.level)) instance_destroy(obj_demo.level);
    room_goto(rm_lobby);
}

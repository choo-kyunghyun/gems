let t = keyboard_check_pressed(ord("Q")) - keyboard_check_pressed(ord("E"));
if (t !== 0) {
    Time.scale += t * 0.1;
}

this.rawAcc += Time.raw;
this.deltaAcc += Time.delta;

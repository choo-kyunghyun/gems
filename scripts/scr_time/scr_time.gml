new Time();

function Time() constructor {
    static raw = 0;
    static scale = 1;
    static delta = 0;
    
    static update = function() {
        Time.raw = delta_time / 1000000;
        Time.delta = Time.raw * Time.scale;
    }
}

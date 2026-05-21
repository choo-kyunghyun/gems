// TODO: JS
function noop() {}

function uuid() {
	static hex_chars = "0123456789abcdef";
	static byte_to_hex = function(_value) {
		var _hi = _value div 16;
		var _lo = _value mod 16;
		return string_char_at(uuid.hex_chars, _hi + 1) + string_char_at(uuid.hex_chars, _lo + 1);
	}

	var _bytes = array_create(16, 0);
	for (var _i = 0; _i < 16; _i++) {
		_bytes[_i] = irandom(255);
	}

	_bytes[6] = (_bytes[6] & $0f) | $40;
	_bytes[8] = (_bytes[8] & $3f) | $80;

	var _uuid = "";
	for (var _j = 0; _j < 16; _j++) {
		_uuid += uuid.byte_to_hex(_bytes[_j]);
		if (_j == 3 || _j == 5 || _j == 7 || _j == 9) {
			_uuid += "-";
		}
	}

	return _uuid;
}

function format_iso_date(_datetime = date_current_datetime(), _ext = true) {
	var _year = string_replace_all(string_format(date_get_year(_datetime), 4, 0), " ", "0");
	var _month = string_replace_all(string_format(date_get_month(_datetime), 2, 0), " ", "0");
	var _day = string_replace_all(string_format(date_get_day(_datetime), 2, 0), " ", "0");
	return _ext ? $"{_year}-{_month}-{_day}" : $"{_year}{_month}{_day}";
}

function format_iso_time(_datetime = date_current_datetime(), _ext = true) {
	var _hour = string_replace_all(string_format(date_get_hour(_datetime), 2, 0), " ", "0");
	var _min = string_replace_all(string_format(date_get_minute(_datetime), 2, 0), " ", "0");
	var _sec = string_replace_all(string_format(date_get_second(_datetime), 2, 0), " ", "0");
	return _ext ? $"{_hour}:{_min}:{_sec}" : $"{_hour}{_min}{_sec}";
}

function format_iso_datetime(_datetime = date_current_datetime(), _ext = true) {
	return $"{format_iso_date(_datetime, _ext)}T{format_iso_time(_datetime, _ext)}";
}

function rem(_value = 1, _font = draw_get_font()) {
    var _info = font_get_info(_font);
    return _value * _info[$ "size"];
}

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

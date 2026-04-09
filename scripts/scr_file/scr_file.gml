function file_find(_mask) {
    var _files = [];
    var _fname = file_find_first(_mask, fa_none);
    while (_fname != "") {
        array_push(_files, _fname);
        _fname = file_find_next();
    }
    file_find_close();
    return _files;
}

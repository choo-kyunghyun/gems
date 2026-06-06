// Plain-object logging utility for verifying game behavior from text.
// Buffers structured lines in memory and writes them to a dedicated clean file
// via File. File.write overwrites (there is no append), so the whole buffer is
// rewritten on flush() — obj_game flushes once per frame, but only when there
// is something new, so an idle game does not rewrite the file every step.
globalThis.Log = {
  PATH: "game.log",
  max: 5000, // ring cap: oldest lines drop so a long run can't grow the file unbounded
  _lines: [],
  _dirty: false,

  write(msg, level = "INFO") {
    this._lines.push(`[${current_time} ${level}] ${msg}`);
    if (this._lines.length > this.max) this._lines.shift();
    this._dirty = true;
  },

  info(msg) {
    this.write(msg, "INFO");
  },
  warn(msg) {
    this.write(msg, "WARN");
  },
  error(msg) {
    this.write(msg, "ERROR");
  },
  debug(msg) {
    this.write(msg, "DEBUG");
  },

  // Rewrite the file if anything changed since the last flush. Cheap no-op when
  // no new lines were logged.
  flush() {
    if (!this._dirty) return;
    File.write(this.PATH, this._lines.join("\n"));
    this._dirty = false;
  },

  // Reset the buffer and truncate the file — call at startup so each run starts fresh.
  clear() {
    this._lines = [];
    this._dirty = false;
    File.write(this.PATH, "");
  },
};

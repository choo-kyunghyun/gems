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

  // Unhandled-exception handler — wired in obj_game via exception_unhandled_handler. The
  // runtime invokes this OUTSIDE any event when a runtime exception goes uncaught: nothing
  // can be drawn and the game closes immediately afterward, so the one useful action is to
  // record the crash to game.log (file I/O is safe here) before it dies — otherwise a crash
  // mid-frame just stops the log at its last flush with no reason. `ex` is the Exception
  // Struct (message/longMessage/script/line/stacktrace). Returns the process exit code: the
  // runtime converts the return value to the runner's exit code, so non-zero = crashed.
  exception(ex) {
    this.error("UNHANDLED EXCEPTION: " + ex.message);
    // GMRT 0.19 leaves longMessage/script/line/stacktrace empty for JS runtime faults, so
    // only emit each when actually populated (avoids blank "at  line 0" noise).
    if (ex.longMessage && ex.longMessage !== ex.message)
      this.error("  " + ex.longMessage);
    if (ex.script) this.error("  at " + ex.script + " line " + ex.line);
    const stack = ex.stacktrace;
    if (stack !== undefined)
      for (let i = 0; i < stack.length; i++) this.error("    " + stack[i]);
    this.flush();
    return 1;
  },
};

// Logging utility for verifying behavior from text. Buffers lines in memory; flush() rewrites the whole
// file (File.write has no append) only when dirty, so an idle game doesn't rewrite every step.
globalThis.Log = {
  PATH: "game.log",
  max: 5000, // ring cap: oldest lines drop so a long run can't grow unbounded
  _lines: [],
  _dirty: false,

  /**
   * @param {string} msg
   * @param {string} [level="INFO"]
   */
  write(msg, level = "INFO") {
    this._lines.push(`[${current_time} ${level}] ${msg}`);
    if (this._lines.length > this.max) this._lines.shift();
    this._dirty = true;
  },

  /**
   * @param {string} msg
   */
  info(msg) {
    this.write(msg, "INFO");
  },
  /**
   * @param {string} msg
   */
  warn(msg) {
    this.write(msg, "WARN");
  },
  /**
   * @param {string} msg
   */
  error(msg) {
    this.write(msg, "ERROR");
  },
  /**
   * @param {string} msg
   */
  debug(msg) {
    this.write(msg, "DEBUG");
  },

  /**
   * buffered lines, capped at max (the oldest have already dropped).
   * @returns {number}
   */
  count() {
    return this._lines.length;
  },

  /** rewrite the file only if dirty since last flush. */
  flush() {
    if (!this._dirty) return;
    File.write(this.PATH, this._lines.join("\n"));
    this._dirty = false;
  },

  /** reset buffer + truncate file — call at startup so each run starts fresh. */
  clear() {
    this._lines = [];
    this._dirty = false;
    File.write(this.PATH, "");
  },

  /**
   * unhandled-exception handler (wired via exception_unhandled_handler). Runs OUTSIDE any
   * event when the game is about to die, so record the crash to game.log before it does.
   * Returns the runner's exit code (non-zero = crashed).
   * @param {Object} ex
   * @returns {number}
   */
  exception(ex) {
    this.error("UNHANDLED EXCEPTION: " + ex.message);
    // GMRT 0.19 leaves longMessage/script/line/stacktrace empty for JS faults — only emit when populated.
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

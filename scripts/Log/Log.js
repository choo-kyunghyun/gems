// Logging utility for verifying behavior from text. Buffers lines in memory; flush() rewrites the whole
// file (File.write has no append) only when dirty, so an idle game doesn't rewrite every step.
globalThis.Log = {
  PATH: "game.log",
  max: 5000, // ring cap: oldest lines drop so a long run can't grow unbounded
  _lines: [],
  _dirty: false,

  write(msg, level = "INFO") {
    Log._lines.push(`[${current_time} ${level}] ${msg}`);
    if (Log._lines.length > Log.max) Log._lines.shift();
    Log._dirty = true;
  },

  info(msg) {
    Log.write(msg, "INFO");
  },
  warn(msg) {
    Log.write(msg, "WARN");
  },
  error(msg) {
    Log.write(msg, "ERROR");
  },
  debug(msg) {
    Log.write(msg, "DEBUG");
  },

  /**
   * buffered lines, capped at max (the oldest have already dropped).
   */
  count() {
    return Log._lines.length;
  },

  /** rewrite the file only if dirty since last flush. */
  flush() {
    if (!Log._dirty) return;
    File.write(Log.PATH, Log._lines.join("\n"));
    Log._dirty = false;
  },

  /** reset buffer + truncate file — call at startup so each run starts fresh. */
  clear() {
    Log._lines = [];
    Log._dirty = false;
    File.write(Log.PATH, "");
  },

  /**
   * unhandled-exception handler (wired via exception_unhandled_handler). Runs OUTSIDE any
   * event when the game is about to die, so record the crash to game.log before it does.
   * Returns the runner's exit code (non-zero = crashed).
   */
  exception(ex) {
    Log.error("UNHANDLED EXCEPTION: " + ex.message);
    // GMRT 0.19 leaves longMessage/script/line/stacktrace empty for JS faults — only emit when populated.
    if (ex.longMessage && ex.longMessage !== ex.message)
      Log.error("  " + ex.longMessage);
    if (ex.script) Log.error("  at " + ex.script + " line " + ex.line);
    const stack = ex.stacktrace;
    if (stack !== undefined)
      for (let i = 0; i < stack.length; i++) Log.error("    " + stack[i]);
    Log.flush();
    return 1;
  },
};

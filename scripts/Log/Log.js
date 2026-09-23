/**
 * The game log, for verifying behaviour from text. Lines buffer in memory; flush() rewrites the
 * whole file (there is no append) only when dirty, so an idle game doesn't rewrite every step.
 */
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

  count() {
    return Log._lines.length;
  },

  flush() {
    if (!Log._dirty) return;
    File.write(Log.PATH, Log._lines.join("\n"));
    Log._dirty = false;
  },

  /** Call at startup so each run starts fresh. */
  clear() {
    Log._lines = [];
    Log._dirty = false;
    File.write(Log.PATH, "");
  },

  /**
   * The unhandled-exception handler: runs outside any event as the game dies, so the crash is
   * flushed here. Returns the runner's exit code.
   */
  exception(ex) {
    Log.error("UNHANDLED EXCEPTION: " + ex.message);
    // BUG: GMRT leaves longMessage/script/line/stacktrace empty for JS faults.
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

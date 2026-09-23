// The one kit file that names Settings: the modified markers and the `opts.key` bindings of the
// value controls.

/** 0 if no item matches. */
globalThis.facetSettingsIndex = function facetSettingsIndex(key, items) {
  const cur = Settings.get(key);
  return Math.max(
    0,
    items.findIndex((item) => item.value === cur),
  );
};

/**
 * Live label suffixed with `*` while `key` (one, or an array for a row that writes several)
 * differs from its default. A `() => boolean` in place of `key` decides for a control bound
 * elsewhere.
 */
globalThis.facetSettingsRef = function facetSettingsRef(label, key) {
  const base = facetTextRef(label);
  if (key === undefined) return base;
  const modified =
    typeof key === "function" ? key : () => Settings.isModified(key);
  return () => (modified() ? base() + " *" : base());
};

/** With `opts.key`, every pick writes the value back before `opts.onChange` runs. */
globalThis.facetBindChoice = function facetBindChoice(items, opts) {
  const key = opts.key;
  const after = opts.onChange;
  return {
    index:
      key !== undefined ? facetSettingsIndex(key, items) : (opts.index ?? 0),
    onChange: (index, value) => {
      if (key !== undefined) Settings.set(key, value);
      if (after !== undefined) after(index, value);
    },
  };
};

/** With `opts.key`, every change writes the value back before `opts.onChange` runs. */
globalThis.facetBindValue = function facetBindValue(opts, fallback) {
  const key = opts.key;
  const after = opts.onChange;
  return {
    value: key !== undefined ? Settings.get(key) : (opts.value ?? fallback),
    onChange: (value) => {
      if (key !== undefined) Settings.set(key, value);
      if (after !== undefined) after(value);
    },
  };
};

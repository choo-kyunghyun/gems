// See FacetTheme.js for the kit overview + the GMRT globalThis-assignment rule.
// The one kit file that names Settings: the modified-marker refs, and the `opts.key`
// bindings the value controls (facetSelect / facetDropdown / facetSlider) resolve through.

/** Index of the item whose `value` matches Settings[key] (0 if none). */
globalThis.facetSettingsIndex = function facetSettingsIndex(key, items) {
  const cur = Settings.get(key);
  return Math.max(
    0,
    items.findIndex((item) => item.value === cur),
  );
};

/**
 * Live textRef for a Settings-bound label: suffixed with `*` while `key` (one key, or an
 * array of them for a row that writes several) differs from its default. Resolved per draw,
 * so a set or a reset shows without a rebuild. Pass no key and it is facetTextRef; pass a
 * `() => boolean` for a control bound elsewhere than Settings (a key rebind) and it decides.
 */
globalThis.facetSettingsRef = function facetSettingsRef(label, key) {
  const base = facetTextRef(label);
  if (key === undefined) return base;
  const modified =
    typeof key === "function" ? key : () => Settings.isModified(key);
  return () => (modified() ? base() + " *" : base());
};

/**
 * Resolve a choice control's `opts` into UISelect/UIDropdown's { index, onChange(index, value) }.
 * With `opts.key` the index is Settings[key]'s item and every pick writes the item's value
 * back before `opts.onChange` runs; without, `opts.index` (0) and `opts.onChange` as given.
 */
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

/**
 * Resolve a scalar control's `opts` into { value, onChange(value) }. With `opts.key` the
 * value is Settings[key] and every change writes it back before `opts.onChange` runs;
 * without, `opts.value` (else `fallback`) and `opts.onChange` as given.
 */
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

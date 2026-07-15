# GMRT JS compatibility: an asset ref reflects as an empty `object`

**Status:** verified on GMRT 0.20. **Not a bug, and likely not worth filing** — this is documented GameMaker handle behaviour, and GM's own asset functions (`sprite_exists`, `object_exists`, `asset_get_type`, `asset_get_index`) validate and identify asset refs correctly (verified below). JS reflection (`Object.keys` / `typeof` / `is_struct`) simply isn't the right tool for GM handles. See [GMRT.md](GMRT.md) §3b.

## Summary

A GameMaker **asset reference** (sprite/shader/object/… handle) exposed to JavaScript reports `typeof === "object"` and `Object.keys(ref)` returns `[]` **without throwing**, but its `constructor` is **not** `Object`. Asset refs are a GameMaker handle type, not ES2020 objects, so JS reflection over them is GM-defined. The hazard: a generic deep-copy or serializer that trusts `typeof === "object"` + `Object.keys` will silently turn a stored handle into `{}`.

**Question for YoYo:** is this the intended reflection behaviour for GM handles under JS, and what is the sanctioned way to distinguish a GM handle from a plain data object? A published GMRT JS compatibility note would help.

## What differs

For `const ref = asset_get_index("sh_vsh_uni")`:

| Check | GMRT 0.20 (asset ref) | ES2020 plain `{}` |
|---|---|---|
| `typeof ref` | `"object"` | `"object"` |
| `is_real(ref)` | `false` | — |
| `Object.keys(ref).length` | `0` (no throw) | `0` |
| `ref.constructor === Object` | **`false`** | `true` |

So `typeof` and `Object.keys` alone can't tell an asset ref from an empty data object; only `constructor === Object` distinguishes them.

## Minimal reproduction

```js
const ref = asset_get_index("sh_vsh_uni");
show_debug_message(typeof ref);                    // "object"
show_debug_message(Object.keys(ref).length);       // 0  (no throw)
show_debug_message(ref.constructor === Object);    // false
```

## Evidence

```
@@3B1@@ got ref  is_real=false  string=ref shader sh_vsh_uni
@@3B1@@ typeof=object
@@3B1@@ Object.keys.length=0
@@3B1@@ ctorIsObject=false
```

## Checking asset refs the GM-native way (verified)

You do **not** need JS reflection to validate or identify an asset ref — GameMaker's asset functions do it, and safely reject non-asset data:

| Check | Result on GMRT 0.20 |
|---|---|
| `asset_get_index("name")` | the ref, or `-1` if the name doesn't exist |
| `asset_get_type("name")` | type constant (shader `10`, object `0`), or `-1` if missing |
| `sprite_exists(ref)` | `true` only for a live sprite; a shader ref → `false`; a **plain data object → `false`** (no throw) |
| `object_exists(ref)` / `shader_is_compiled(ref)` | `true` for a live asset of that type |

So `sprite_exists(ref)` / `object_exists(ref)` are the right way to ask "is this a live asset of type X?", and they don't choke on non-asset data.

**What does NOT discriminate** (all reflect the handle as a struct): `typeof ref` is `"object"`, `is_struct(ref)` is **`true`**, and `Object.keys(ref)` is `[]` — an asset ref is indistinguishable from an empty struct under JS reflection. To tell a *data object* from a *handle* in generic code (e.g. a deep-copy), use `v.constructor === Object` (true only for object literals) and pass refs through by reference.

## Expected / requested behaviour

Clarify the intended JS reflection over GM handles, and document a reliable discriminator. In practice `v.constructor === Object` works today (`true` only for object literals), and refs should be passed through by reference rather than deep-copied.

## Workaround

Discriminate plain data before copying/serializing, and pass refs through untouched:

```js
if (v !== null && typeof v === "object" && v.constructor === Object) {
    // real data object — safe to deep-copy
} else {
    // asset ref / handle — pass by reference
}
```

## Deduplication

No existing report found (searched asset ref / Object.keys / typeof reflection).

---

## If filing at all (documentation request, low priority)

Since GM's asset functions already cover validation/identification, this is at most a **documentation** ask — e.g. "note on the JS compatibility page that GM handles reflect as empty structs, and that `sprite_exists`/`object_exists`/`asset_get_type` are the way to check them." Not a bug report.

- **Flair:** GMRT Runtime
- **Title:** `GMRT: [JavaScript] Please document that asset refs reflect as empty structs under JS (use *_exists / asset_get_type to check them)`
- **Category:** In-Game / Runtime
- **Version:** GMRT 0.20.0 *(version field may be mislabeled)* — **Platform:** Windows

**Description**

A GameMaker asset reference exposed to JavaScript reports `typeof === "object"` and `Object.keys(ref)` returns `[]` without throwing, while `ref.constructor` is not `Object`. Because asset refs are GM handles rather than ES2020 objects, generic reflection-based code (deep-copy, serialization) can silently flatten a stored handle to `{}`. Please confirm whether this reflection behaviour is intended and document the sanctioned way to distinguish a GM handle from a plain data object under JS.

**Steps To Reproduce**

1. In a `.js` event/script:
   ```js
   const ref = asset_get_index("some_asset");
   show_debug_message(typeof ref + " / " + Object.keys(ref).length + " / " + (ref.constructor === Object));
   ```
2. Output is `object / 0 / false`.

**Expected Change**

Documented, reliable JS reflection semantics for GM handles (and a sanctioned discriminator), or reflection that lets standard data-vs-handle checks work.

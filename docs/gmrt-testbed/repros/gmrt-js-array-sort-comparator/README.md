# [JavaScript] `Array.prototype.sort` does not conform to the ECMAScript specification

In the GMRT runtime, JavaScript's `Array.prototype.sort()` does not follow the ECMAScript
specification ([ES2020 §Array.prototype.sort](https://tc39.es/ecma262/2020/#sec-array.prototype.sort)).
It deviates in two independent ways:

1. The spec interprets the comparator's return by *sign only* —
   negative, zero, or positive. GMRT truncates the return to an integer, so a fractional value
   less than 1 (e.g. from the common `(a, b) => a - b`) is read as `0` ("equal") and the array
   is mis-sorted.
2. The spec requires a stable sort — elements that compare equal keep their
   input order. GMRT reorders equal elements, even with a plain integer comparator, so it is
   not stable.

Node/V8 and browsers conform on both counts. GML's `array_sort()` is a separate function,
documented as integer-only and using a non-stable `qsort`; GMRT's JavaScript sort appears to
inherit that algorithm, but `Array.prototype.sort` has no such licence in the ECMAScript spec.
Returning an integer (e.g. `Math.sign(a - b)`) avoids deviation 1; there is no workaround for
the missing stability guarantee.

## Steps to reproduce

The `obj_repro` Create event is written in JavaScript; the GML calls are guarded so the same
file runs on GMRT and in Node.

Run on GMRT (tested with GMRT 0.20.0, `@gamemaker/gm-cli` 2.2.0, on Windows 11):

```
npx @gamemaker/gm-cli run --toolchain GMRT
```
```
sort a-b  -> [0.8,0.2,0.5]                   <- deviation 1: should be [0.2,0.5,0.8]
sort zero -> [6,7,2,8,4,9,1,10,5,11,3,12]    <- deviation 2: should be unchanged
GML sort  -> [0.2,0.8,0.5]
```

Run the same file in Node for the spec-conformant result:

```
node objects/obj_repro/Create_0.js
```
```
sort a-b  -> [0.2,0.5,0.8]
sort zero -> [1,2,3,4,5,6,7,8,9,10,11,12]
GML sort  -> unavailable in this runtime
```

- `sort a-b` sorts `[0.2, 0.8, 0.5]` with `(a, b) => a - b` — GMRT truncates the fractional
  return and mis-sorts it.
- `sort zero` sorts `[1..12]` with a comparator that always returns `0` — a stable sort must
  return the input unchanged; GMRT scrambles it.
- `GML sort` shows GML `array_sort()` (a separate function, undefined in Node) producing yet
  another order, confirming it is not `Array.prototype.sort`.

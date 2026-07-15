# GMRT: `array_sort` gives a different sort order on GMRT than GMS2 (fractional comparator return)

**Status:** verified live GMRT 0.20 vs GMS2 2026.0.0.23 (2026-07-15), **unreported**. File as a **descriptive** item led by the **GMS2-vs-GMRT** divergence (same GML code, different result), with the JS `Array.sort` / standard-JS comparison as supporting seasoning — no bug-vs-docs verdict (see "Why file it descriptively" and [GMRT.md](GMRT.md) §3b).
**Repro:** [`repros/gmrt-js-array-sort-comparator/`](../repros/gmrt-js-array-sort-comparator/) — **switchable**: one GML object `obj_gml_sort` (GML `array_sort`, both runtimes) + one JS script `scr_array_sort_js` (`scriptSource`=`.js`, top-level auto-runs `Array.sort` on GMRT). `gm-cli run` (GMRT: both truncate), `run --toolchain GMS2` (GML sorts; `.js` script ignored, no build error), `node scripts/scr_array_sort_js/scr_array_sort_js.js` (JS baseline sorts) → the whole table below from one project.

## Summary

**GameMaker's two runtimes disagree on the same code.** The identical GML `array_sort(arr, (a, b) => a - b)` **sorts correctly on GMS2** but is a **silent no-op on GMRT**: GMRT truncates the comparator's fractional return to `0` ("equal"), so a float array whose neighbours are less than 1 apart is left unsorted. A GMS2 project that sorts floats this way silently mis-sorts when built for GMRT — no error, no warning. GMRT's result matches the `array_sort` manual's letter ("the return must be an integer; floats < 1 read as 0"); GMS2's does not.

*A pinch of salt — the same split shows up in JavaScript:* GMRT's JS `Array.prototype.sort` truncates exactly like its GML `array_sort`, while standard JS (Node / ES2020, which orders by the **sign** of the returned Number) honors the fraction — just like GMS2. So GMRT is the odd one out on both fronts; GMS2 and standard JS agree.

| Runtime / reference | Sort | Fractional `(a,b)=>a-b` on `[0.3,0.1,0.2]` |
|---|---|---|
| **GameMaker GMS2** — GML `array_sort` | honors the fraction | `[0.1,0.2,0.3]` ✅ sorted |
| **GameMaker GMRT** — GML `array_sort` | truncates to int | `[0.3,0.1,0.2]` ❌ no-op |
| GMRT — JS `Array.sort` *(salt)* | truncates to int | `[0.1,0.3,0.2]` ❌ mis-sorted |
| Standard JS / Node *(salt)* | honors the sign | `[0.1,0.2,0.3]` ✅ sorted |
| `array_sort` manual | documentation | integer only ("floats < 1 read as 0") |

The headline is the first two rows: **same GML code, two GameMaker runtimes, different result.** The JS rows are seasoning — they show the "honors the fraction" behaviour (GMS2) is also what standard JavaScript does, isolating GMRT + the manual as the outlier.

## Why file it descriptively (not as bug-vs-docs)

Whether this is a "bug" or a "docs issue" is contingent and even circular: if the manual's integer-only contract is authoritative, GMRT is consistent and GMS2/standard-JS are the outliers; if the docs are relaxed to match GMS2/JS, GMRT's truncation becomes a code bug. Rather than pre-classify (which pre-decides the answer), this item just **documents the divergence** — the observable fact that two GameMaker runtimes sort the same code differently — and lets the team decide which behaviour is intended, and whether the silent break for ported GMS2 projects should be addressed.

## Minimal reproduction

```gml
// GML, on GMRT vs GMS2:
var a = [0.3, 0.1, 0.2];
array_sort(a, function(x, y) { return x - y; });   // GMRT: [0.3,0.1,0.2] (no-op);  GMS2: [0.1,0.2,0.3]
```
```js
// JS (salt), on GMRT vs Node:
[0.3, 0.1, 0.2].sort((a, b) => a - b);              // GMRT: [0.1,0.3,0.2];  Node: [0.1,0.2,0.3]
```

## Evidence

From the switchable repro's `obj_gml_sort` (GML `array_sort`, runs on both toolchains) — fractional `(x,y)=>x-y` on `[0.3,0.1,0.2]`, verified 2026-07-15:

```
GMRT (gm-cli run):                  frac=[0.3,0.1,0.2] (no-op)    sign=[0.1,0.2,0.3]
GMS2 (gm-cli run --toolchain GMS2): frac=[0.1,0.2,0.3] (sorted)   sign=[0.1,0.2,0.3]
```

JS salt — `scr_array_sort_js` (GMRT) vs Node, same file (`node scripts/scr_array_sort_js/scr_array_sort_js.js`):

```
@@SORT@@ JS  (a,b)=>a-b  = [0.1,0.3,0.2]   [Node: 0.1,0.2,0.3]
@@SORT@@ JS  sign-return = [0.1,0.2,0.3]   [Node: 0.1,0.2,0.3]  (workaround)
```

## Workaround

Return an explicit sign: GML `array_sort(arr, (a, b) => sign(a - b))`; JS `arr.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))`.

## Deduplication

No ticket found for the **GMRT-vs-GMS2 `array_sort` divergence** or for **JS `Array.sort`** comparator-return handling. The GML `array_sort` cluster (#56 / #185 / #194 / #2252) is about the function's behaviour on the legacy runtime, not the cross-runtime GMS2↔GMRT difference; the JS `Array.sort` handling has no GameMaker documentation at all. (Honest caveat for triage: GMRT's GML result *does* match the `array_sort` manual's integer-only wording, so a reviewer may read GMRT as "correct per docs" and GMS2 as lenient — which is exactly why this is filed descriptively, surfacing the divergence + the silent-port-break rather than asserting a side.)

---

## Ready-to-file IDE report

- **Flair:** GMRT Runtime
- **Title:** `GMRT: array_sort returns a different sort order than GMS2 for a fractional comparator return (JS Array.sort matches GMRT)`
- **Category:** In-Game / Runtime
- **Version:** GMRT 0.20.0 *(version field may be mislabeled)* — **Platform:** Windows

**Description**

GameMaker's two runtimes sort the same code differently. The identical GML `array_sort(arr, (a,b)=>a-b)` sorts correctly on GMS2 but is a silent no-op on GMRT: GMRT truncates the comparator's fractional return to 0 ("equal"), so a float array whose neighbours are less than 1 apart is left unsorted. A GMS2 project that sorts floats this way silently mis-sorts when built for GMRT — no error or warning. GMRT's result matches the `array_sort` manual's letter ("floats < 1 read as 0"); GMS2's does not.

The same split appears in JavaScript: GMRT's JS `Array.prototype.sort` truncates like its GML `array_sort`, while standard JS (Node / ES2020, sign of the Number) honors the fraction — like GMS2. So GMRT is the outlier on both; GMS2 and standard JS agree.

| Runtime / reference | Fractional `(a,b)=>a-b` on `[0.3,0.1,0.2]` |
|---|---|
| GameMaker GMS2 — GML `array_sort` | `[0.1,0.2,0.3]` (sorted) |
| GameMaker GMRT — GML `array_sort` | `[0.3,0.1,0.2]` (no-op) |
| GMRT — JS `Array.sort` | `[0.1,0.3,0.2]` (mis-sorted) |
| Standard JS / Node | `[0.1,0.2,0.3]` (sorted) |
| `array_sort` manual | integer only ("floats < 1 read as 0") |

**Steps To Reproduce**

1. GML, on both toolchains: `var a=[0.3,0.1,0.2]; array_sort(a, function(x,y){return x-y;}); show_debug_message(string(a));`
2. `gm-cli run` (GMRT) → `[0.3,0.1,0.2]` (unsorted). `gm-cli run --toolchain GMS2` → `[0.1,0.2,0.3]` (sorted).
3. (Salt) JS: `console.log([0.3,0.1,0.2].sort((a,b)=>a-b).join(","))` → GMRT `0.1,0.3,0.2`; Node `0.1,0.2,0.3`.

**Expected Change**

The team clarifies which behaviour is intended: either GMRT's `array_sort`/`Array.sort` order by the sign of the comparator's return (matching GMS2 and standard JS), or the GMRT-vs-GMS2 divergence is documented (and, for JS, a GMRT JS compatibility note is added — there is none today) so the silent difference for ported projects is at least discoverable.

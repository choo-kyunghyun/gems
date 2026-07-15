# [JavaScript] `Array.prototype.sort` intermittently throws `TypeError: Invalid call target`

Separate from the sort *semantics* issues (see `README.md`), GMRT's JavaScript compiler emits
invalid code for some `Array.prototype.sort()` calls, so a perfectly valid sort throws
`TypeError: Invalid call target` at runtime. This is a code-generation defect, not a
spec-semantics one — the same source runs in Node and every browser.

The trigger is fragile: it flips between crashing and running on edits that have no meaning in
JavaScript — variable *names*, an inline literal vs a variable, integer vs non-integer values,
or an unrelated statement placed before the sort. That sensitivity is itself the evidence that
the defect is in code generation, not semantics.

## Steps to reproduce

Two Create-event scripts, structurally identical, differing **only in variable names**. One
crashes; the other does not.

Crashes — `TypeError: Invalid call target` at the `.sort()` line:

```js
var byValue = function (a, b) { return a - b; };
var frac = [0.2, 0.8, 0.5];
console.log(frac.sort(byValue).join(","));
```

Runs fine — prints `0.8,0.2,0.5`:

```js
var cmp = function (a, b) { return a - b; };
var arr = [0.2, 0.8, 0.5];
console.log(arr.sort(cmp).join(","));
```

Put either in an object's JavaScript Create event and run:

```
npx @gamemaker/gm-cli run --toolchain GMRT
```

The crashing version produces:

```
objects/obj_repro/Create_0.js (3): ...
Unhandled exception: TypeError: Invalid call target
```

## Other edits that flip a crash into a success

Starting from the crashing version, any one of these makes it run:

- Use an inline array literal instead of a variable: `[0.2, 0.8, 0.5].sort(byValue)`.
- Use integer values: `var frac = [2, 1, 3];`.
- Insert any statement before the sort, e.g. `console.log("x");`.

The comparator's return value is irrelevant — an integer `sign`-style comparator
(`a < b ? -1 : a > b ? 1 : 0`) crashes the same way, so this is unrelated to the fractional
comparator-return issue documented in `README.md`.

## Environment

- GMRT runtime 0.20.0
- `@gamemaker/gm-cli` 2.2.0
- Windows 11 (x64)

## Notes

- The exception is reported at the `.sort()` line as `TypeError: Invalid call target`.
- Because the trigger depends on undefined optimizer behaviour, there is no dependable
  source-level workaround; the "runs fine" variants above only happen to avoid it.

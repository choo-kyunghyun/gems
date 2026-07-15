# GMRT JS compatibility: bitwise operators use GML 64-bit ints, not ES2020 ToInt32

**Status:** verified on GMRT 0.20 — **decided NOT to file** (2026-07-15). This is a deliberate consequence of GMRT's number model (NaN-boxed doubles / int64, no `int32` type), not a standalone defect; it belongs to the "GMRT number semantics" theme already open as [#15060](https://github.com/YoYoGames/GameMaker-Bugs/issues/15060) (int64 promotion) and [#11835](https://github.com/YoYoGames/GameMaker-Bugs/issues/11835) (`is_int32`/type predicates). Kept as an internal compat note — see [GMRT.md](GMRT.md) §3b. If ever worth raising, comment on #15060 rather than open a new ticket.
**Repro:** standalone minimal project at [`repros/gmrt-js-bitwise-int32/`](../repros/gmrt-js-bitwise-int32/).

## Summary

JavaScript bitwise operators (`<<`, `>>`, `^`, `&`, `|`) on GMRT operate with GML's **64-bit integer** semantics instead of ES2020's **ToInt32** (operands coerced to signed 32-bit, results wrapping at 32 bits). Any algorithm that relies on 32-bit overflow — e.g. a chained xorshift PRNG — therefore computes **different values** than Node/V8. Nothing throws; the result is simply non-portable and diverges from every other JS engine.

**The underlying question:** should JS bitwise operators follow ES2020 ToInt32 (32-bit wrapping), or is GML's 64-bit integer behaviour intended? This governs the portability of all bit-manipulation code — but it's really a facet of GMRT's number model (see the Decision below).

## What differs

A 32-bit xorshift from seed `123456789` (`s ^= s<<13; s ^= s>>17; s ^= s<<5;`), one line per round:

| Round | GMRT 0.20 | Node / ES2020 (ToInt32) |
|---|---|---|
| 0 | -1579999415 | -1579999415 *(coincidentally equal)* |
| 1 | **-2056153900** | **-2055334700** |
| 2 | **1250077441** | **-1150135322** |
| 3 | -474866960 | -790886591 |

Round 0 happens to stay within 32 bits and matches; from round 1 the sequences diverge and never re-converge.

## Minimal reproduction

```js
let s = 123456789;
s ^= s << 13; s ^= s >> 17; s ^= s << 5;   // round 0 -> both -1579999415
s ^= s << 13; s ^= s >> 17; s ^= s << 5;   // round 1 -> GMRT -2056153900, Node -2055334700
```

## Evidence

```
GMRT:  round0=-1579999415  round1=-2056153900  round2=1250077441  round3=-474866960
Node:  round0=-1579999415  round1=-2055334700  round2=-1150135322 round3=-790886591
```

## Expected / requested behaviour

Either match ES2020 (bitwise operands go through ToInt32, results are signed 32-bit), or document that JS bitwise operators intentionally use GML 64-bit integer semantics — so developers know that 32-bit bit-twiddling algorithms are not portable.

## Workaround

Avoid bitwise operators for 32-bit algorithms; use integer-float arithmetic. For PRNGs, a Park–Miller MINSTD LCG (`s = (s * 48271) % 2147483647`) needs no bitwise ops. (Single, non-overflowing bitwise ops — e.g. packing small ids — are unaffected.)

## Deduplication

No ticket covers JS bitwise / ToInt32 specifically (searched bitwise / int32 / ToInt32 / xorshift). But the root cause — GMRT has no `int32` type — is the same number-model theme as [#15060](https://github.com/YoYoGames/GameMaker-Bugs/issues/15060) ("increase threshold for promoting values to int64"; NaN-boxing, ±2^53) and [#11835](https://github.com/YoYoGames/GameMaker-Bugs/issues/11835) (`is_int32`/`is_int64`/`typeof` differ from GMS2). ([#15054](https://github.com/YoYoGames/GameMaker-Bugs/issues/15054) is a *different* thing — a GMRT bitwise-on-enum **compile** fail.) Since the theme is already tracked, this stays a documented compat note, not a new report.

---

## Decision — not filing

GMRT deliberately runs JS on the GML runtime, where a number is a NaN-boxed double with int64 promotion and there is **no `int32` type** — so ES2020 ToInt32 (32-bit wrapping) isn't natural to implement, and this reads as a known architectural divergence rather than a fixable defect. It's low-severity (only 32-bit-overflow-dependent code like xorshift is affected) and fully avoidable (see Workaround). The root — GMRT's integer model — is already an open topic ([#15060](https://github.com/YoYoGames/GameMaker-Bugs/issues/15060), [#11835](https://github.com/YoYoGames/GameMaker-Bugs/issues/11835)). So: **not filing a standalone report.** If the portability of JS bitwise ops is ever worth pushing, add a comment on #15060 (which owns the number-model discussion) instead of opening a new ticket.

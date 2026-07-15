# GMRT minimal repro projects

Standalone, minimal GameMaker projects — one per unreported GMRT JavaScript issue —
built to attach to YoYoGames bug reports. Each is a `blank` project (toolchain **GMRT**,
see its `gm-options.json`) with a single object `obj_repro` whose **Create event is a
JavaScript event** carrying the minimal reproduction, plus one instance in `room1`.

Each project's `README.md` states what it shows, how to run, and the GMRT-vs-Node/V8
(ES2020 baseline) outcome. The canonical write-up for each lives in [`../docs/`](../docs/).

## The repros (unreported)

| Project | Issue | Trigger | Canonical doc |
|---|---|---|---|
| [`gmrt-js-array-sort-comparator`](gmrt-js-array-sort-comparator/) | `Array.sort` truncates comparator return to int *(compat Q)* | run | [compat-js-array-sort-comparator.md](../docs/compat-js-array-sort-comparator.md) |
| [`gmrt-js-bitwise-int32`](gmrt-js-bitwise-int32/) | Bitwise ops use GML 64-bit ints, not ES2020 ToInt32 *(compat Q — **not filing**, see [#15060](https://github.com/YoYoGames/GameMaker-Bugs/issues/15060))* | run | [compat-js-bitwise-int32.md](../docs/compat-js-bitwise-int32.md) |

Both were verified reproducing on **GMRT 0.20.0** (2026-07-15); both are ES2020-vs-GML-semantics
*compat Q* items. **Array.sort** is the only one still to file; **bitwise** is a documented note
we've decided not to file (see [#15060](https://github.com/YoYoGames/GameMaker-Bugs/issues/15060)).
Each repro's `.js` runs unchanged in Node too (`node objects/obj_repro/Create_0.js`) for the ES2020 baseline.

**Once an issue is filed, its repro project is removed here** (the IDE bundles the sample
onto the issue) and the finding moves to a one-line entry in [`../docs/GMRT.md`](../docs/GMRT.md) §4b.
Filed so far: **[#15563](https://github.com/YoYoGames/GameMaker-Bugs/issues/15563)** (toUpperCase),
**[#15564](https://github.com/YoYoGames/GameMaker-Bugs/issues/15564)** (function-hoisting),
**[#15565](https://github.com/YoYoGames/GameMaker-Bugs/issues/15565)** (JSON.stringify),
**[#15566](https://github.com/YoYoGames/GameMaker-Bugs/issues/15566)** (empty for-loop initializer — build),
**[#15567](https://github.com/YoYoGames/GameMaker-Bugs/issues/15567)** (object key/value in Map/Set).

## Running a repro

```
cd gmrt-js-array-sort-comparator
npx @gamemaker/gm-cli run
```

`gm-cli run` rebuilds the per-project `.gmcache/` on first run (the GMRT runtime itself
is in the shared global cache, not per project).

## Filing a bug report

Open the repro project in the GameMaker IDE and use its bug reporter — it **bundles the
sample project automatically**, so there's no need to zip anything by hand. Each project's
`README.md` is written in the IDE report format (Title / Description / Steps To Reproduce),
ready to paste. The `.gmcache/` and `Build/` folders are disposable build output (rebuilt
on run) and aren't part of the source.

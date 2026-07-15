# GMRT JS: a static field can't reference its own class name (TDZ during static init)

**Status:** verified on GMRT 0.20 — **NOT filing.** Public static class fields are **ES2022**, outside GMRT's stated **ES2020** target, so a bug in them isn't in scope (and probably isn't a planned feature). Kept as an **internal reference only**: don't use `static x = value` field syntax in GMRT JS. See the ES-version note below and [GMRT.md](GMRT.md) §3a.

> **ES version note.** Public **static class fields** (`static x = …`) are **ES2022**, *not* ES2020 — so this is not an "ES2020 conformance" item. GMRT nonetheless **accepts and runs** the static-field syntax; it just implements the initializer scoping incorrectly (vs Node/V8, which implements ES2022). The report is therefore "GMRT accepts static class fields but evaluates their initializers wrongly" — either fix the semantics or reject the syntax at compile time; a **silent wrong value** (the `this` case below) is the worst outcome.

## Summary

When a class's **static field initializer** references the class itself, GMRT gets it wrong two ways:

- **`static x = ClassName.y`** → throws `ReferenceError: can't access lexical declaration 'ClassName' before initialization` — GMRT evaluates the initializer while the class binding is still in its **temporal dead zone**. Per the spec the class binding is initialized *before* static elements run, so Node/V8 gives the value.
- **`static x = this.y`** (in a static initializer `this` *is* the class) → **no error, but the wrong value** (`0` instead of `5`) — a *silent* failure, so `this` is not a usable alternative.

Referencing a *different*, already-defined class is fine, and a literal initializer is fine.

## What breaks

| Form | GMRT 0.20 | Node |
|---|---|---|
| `class Foo { static y=5; static x=Foo.y }` | 💥 `ReferenceError: can't access lexical declaration 'Foo' before initialization` | ✅ `Foo.x === 5` |
| `const C = class Self { static x=Self.y }` | 💥 `ReferenceError: Self is not defined` | ✅ `C.x === 5` |
| `class A { static y=5; static x=this.y }` | ⚠️ no error — `A.x === 0` (silently **WRONG**) | ✅ `A.x === 5` |
| `class B { static x = 5 }` (literal) | ✅ ok | ✅ |
| `class Baz { static x = Bar.y }` (other class) | ✅ ok | ✅ |

The declaration form's error is uncaught and **aborts the run**; the class-expression form's error is a catchable `ReferenceError`.

## Mechanism — it is *not* GameMaker's lazy statics

A tempting explanation is GameMaker's lazy-static rule: a GML *constructor*'s `static` initializes on first `new`, not at definition (ticket [#7722](https://github.com/YoYoGames/GameMaker-Bugs/issues/7722)). Verified here — a GML constructor static's side effect fires only on the first `new`, identically on GMRT and GMS2:

```
@@GMLSTATIC@@ before new  se=0     // GML: static NOT initialized until first new
@@GMLSTATIC@@ after 1st new se=1
@@GMLSTATIC@@ after 2nd new se=1    // inits once
```

But **JS class static fields on GMRT are eager**, not lazy — a static initializer's side effect fires at **class-definition time**, before any read or `new` (matching ES2022):

```
@@LAZY@@ after def   se=1           // JS: static initialized eagerly at class def
```

So the self-reference failure is **not** the lazy-static behaviour. It is an initialization-*ordering* bug: GMRT runs the eager static initializer while the class's own name binding is still in the TDZ (`ClassName.y` → `ReferenceError`) and `this` isn't yet bound to the class (`this.y` → wrong value). This distinction matters for the report — it rules out "statics are lazy, working as intended."

## Minimal reproduction

```js
class Foo { static y = 5; static x = Foo.y; }   // GMRT: ReferenceError; Node: Foo.x === 5
```

## Evidence

GMRT console — class-name self-ref throws; `this.y` silently returns `0`:

```
@@STATICFIELD@@ expr THREW: ReferenceError: Self is not defined
Unhandled exception: ReferenceError: can't access lexical declaration 'Foo' before initialization
@@STATICTHIS@@ this.y   -> A.x=0   [Node 5]
@@STATICTHIS@@ literal  -> B.x=5   [Node 5]
@@STATICTHIS@@ C.y      THREW: ReferenceError: can't access lexical declaration 'C' before initialization
```

Node baseline (both forms give 5):

```
this.y A.x= 5     C.y C.x= 5     literal B.x= 5
```

## Expected behaviour

A static field initializer can reference its own class (the class binding is initialized before static elements run), matching Node/V8 — `Foo.x === 5`.

## Workaround — stay within ES2020

The clean fix is to avoid `static x = value` **field** syntax entirely (it's ES2022). Use a static **method** (ES2015), or assign the static **after** the class definition (ES2015):

```js
class Foo {
    static getY() { return 5; }      // static method — ES2015
}
Foo.x = Foo.getY();                  // assign static after the class is defined — ES2015
```

(If you do use static fields, only a literal initializer is safe — never `ClassName.y` or `this.y`.)

## Deduplication

No existing report found for the JS `static` field / class-name case. The nearby tickets [#15300](https://github.com/YoYoGames/GameMaker-Bugs/issues/15300) and [#11852](https://github.com/YoYoGames/GameMaker-Bugs/issues/11852) are about **GML's `static_get()` builtin**, a different mechanism — not the JS class `static` field.

---

## Not filing (out of scope)

Static class fields are **ES2022**; GMRT targets **ES2020**. Reporting a bug in an out-of-scope, likely-unplanned feature would probably be closed as "not supported," so this stays an internal reference rather than a bug report. It's fully avoidable within ES2020 (see the workaround). If it were ever filed, the strongest angle isn't "match ES2022" but "GMRT accepts the syntax yet returns a **silent wrong value** for `this.y` — reject it at compile time instead."

_(Caveat when citing any ES version to YoYo: don't assume the team tracks the full ES2020 spec — lead with the Node/V8 behaviour and a minimal repro, not chapter-and-verse spec citations.)_

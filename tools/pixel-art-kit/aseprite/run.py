#!/usr/bin/env python3
"""run — invoke an Aseprite .lua headless (LOCAL DEPENDENCY: Aseprite installed).

Wraps `Aseprite.exe -b -script-param k=v ... -script <lua>` so Aseprite steps compose into
a Python workflow like the other tools. Aseprite path via the ASEPRITE env var; output dirs
resolve under the shared toolkit out/.

Usage:
  python run.py draw      # static icons -> out/aseprite
  python run.py anim      # coin spin    -> out/anim/aseprite
  python run.py states    # tag the agent hero strip -> out/anim/aseprite_hero
  python run.py <name> k=v ...   # raw: run aseprite_<name>.lua with extra params
"""
import os, sys, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.dirname(HERE)
ASE = os.environ.get("ASEPRITE", "Aseprite.exe")  # set ASEPRITE to the full path if not on PATH


def out(*p):
    d = os.path.join(KIT, "out", *p)
    os.makedirs(d, exist_ok=True)
    return d


def presets():
    return {
        "draw":   ("aseprite_draw.lua",   {"out": out("aseprite")}),
        "anim":   ("aseprite_anim.lua",   {"out": out("anim", "aseprite")}),
        "states": ("aseprite_states.lua", {"in": os.path.join(KIT, "out", "anim", "agent_hero", "hero_strip.png"),
                                           "out": out("anim", "aseprite_hero")}),
    }


def run(lua, params):
    args = [ASE, "-b"]
    for k, v in params.items():
        args += ["-script-param", f"{k}={str(v).replace(os.sep, '/')}"]  # forward slashes for Aseprite
    args += ["-script", os.path.join(HERE, lua)]
    print("  $", " ".join(args))
    subprocess.run(args, check=False)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    if not os.path.isfile(ASE):
        print(f"  ! Aseprite not found at {ASE} — set the ASEPRITE env var")
        return
    name = sys.argv[1]
    extra = dict(a.split("=", 1) for a in sys.argv[2:] if "=" in a)
    ps = presets()
    if name in ps:
        lua, params = ps[name]
        params.update(extra)
    else:
        lua, params = f"aseprite_{name}.lua", extra
    run(lua, params)


if __name__ == "__main__":
    main()

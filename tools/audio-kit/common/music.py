#!/usr/bin/env python3
"""music — render BGM song templates to a looping stereo WAV + a real .mid.

The BGM analogue of pixel-art-kit's animate.py: a song is DATA (`templates/bgm/*.json`),
rendered two ways — a playable stereo WAV (the GameMaker asset, looped via the sound's
loop flag) and an editable Standard MIDI File (the "MIDI base", out/bgm/<name>.mid).

A template:
  {"bpm", "beats", "tracks": [ <track>, ... ]}      beats = loop length (quarter notes)
A track is ONE of:
  explicit:  {"instrument", "gain"?, "pan"?, "notes": [["C4", start, dur, vel?], ...]}
  tracker:   {"instrument", "gain"?, "pan"?, "step", "vel"?, "tile"?, "seq": [tok, ...]}
             one token per `step` beats; "" / "." / "r" = rest, "-" = tie (extend the
             previous note), anything else = a note ("x" triggers a drum patch).
             tile:true repeats the seq to fill `beats` (write a 1-bar drum pattern once).
`instrument` names a synth.PATCHES preset; `pan` is -1 (L) .. +1 (R).

Determinism is inherent (fixed note math; drum noise seeded by track+note index).
Run `python music.py` to render every templates/bgm/*.json.
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audiolib as A
import synth as S
import midilib as M

BGM_DIR = os.path.join(A.KIT, "templates", "bgm")


def _expand(tr, beats):
    """A track (explicit or tracker form) -> {instrument, gain, pan, notes:[(pitch, startBeat, durBeat, vel)]}."""
    out = {"instrument": tr.get("instrument", "lead"),
           "gain": tr.get("gain", 0.5), "pan": tr.get("pan", 0.0), "notes": []}
    if "notes" in tr:
        for e in tr["notes"]:
            out["notes"].append((e[0], e[1], e[2], e[3] if len(e) > 3 else 0.8))
        return out
    step = tr.get("step", 0.25)
    vel = tr.get("vel", 0.8)
    seq = list(tr["seq"])
    if tr.get("tile") and beats and step > 0:
        one = len(seq) * step
        if one > 0:
            seq = seq * int(math.ceil(beats / one))
    t = 0.0
    cur = None                                  # (pitch, startBeat) of the note in progress
    for tok in seq:
        if tok == "-" and cur is not None:      # tie: hold the current note one more step
            t += step
            continue
        if cur is not None:                     # close the note we were holding
            out["notes"].append((cur[0], cur[1], t - cur[1], vel))
            cur = None
        if tok not in ("", ".", "r", "rest", None):
            cur = (tok, t)
        t += step
    if cur is not None:
        out["notes"].append((cur[0], cur[1], t - cur[1], vel))
    return out


def render_song(spec, sr=A.SR):
    """A loaded song template -> (left, right, bpm, beats). The mix is truncated to
    exactly `beats` so the sound's loop flag repeats it seamlessly."""
    bpm = spec.get("bpm", 120)
    spb = 60.0 / bpm                            # seconds per beat
    tracks = [_expand(t, spec.get("beats")) for t in spec["tracks"]]
    beats = spec.get("beats") or max(
        (n[1] + n[2] for tr in tracks for n in tr["notes"]), default=4)
    total = A.seconds(beats * spb, sr)
    left, right = A.silence(total), A.silence(total)

    for ti, tr in enumerate(tracks):
        patch = S.PATCHES.get(tr["instrument"], S.PATCHES["lead"])
        theta = (tr["pan"] + 1.0) * 0.25 * math.pi      # equal-power pan
        lpan, rpan = math.cos(theta), math.sin(theta)
        for ni, (pitch, sb, db, vel) in enumerate(tr["notes"]):
            start = A.seconds(sb * spb, sr)
            if patch.get("drum"):
                buf = S.drum(patch["drum"], sr, seed=ti * 9973 + ni)
            else:
                f = S.note_freq(pitch)
                if f <= 0.0:
                    continue
                buf = S.tone(A.seconds(db * spb, sr), sr, patch.get("wave", "pulse"),
                             f0=f, duty=patch.get("duty", 0.5),
                             vib_rate=patch.get("vib_rate", 0.0),
                             vib_depth=patch.get("vib_depth", 0.0), seed=ti * 31 + ni)
                S.adsr(buf, sr, patch.get("a", 0.005), patch.get("d", 0.05),
                       patch.get("s", 0.7), patch.get("r", 0.05))
            buf = A.gain(buf, vel * tr["gain"])
            A.add_into(left, A.gain(buf, lpan), start)
            A.add_into(right, A.gain(buf, rpan), start)

    left, right = left[:total], right[:total]   # cut tails past the loop point
    pk = max(A.peak(left), A.peak(right))
    if pk > 0.95:                                # tame summed peaks without squashing dynamics
        k = 0.95 / pk
        left, right = A.gain(left, k), A.gain(right, k)
    return left, right, bpm, beats


def to_midi_tracks(spec):
    """The same note data as General-MIDI tracks for midilib.write_midi."""
    tracks = []
    ch = 0
    for tr0 in spec["tracks"]:
        tr = _expand(tr0, spec.get("beats"))
        patch = S.PATCHES.get(tr["instrument"], {})
        drum = patch.get("drum")
        notes = []
        for (pitch, sb, db, vel) in tr["notes"]:
            midi = patch.get("program") if drum else S.note_midi(pitch)
            if midi is None:
                continue
            notes.append((midi, sb, db, 20 + int(vel * 100)))
        if drum:
            tracks.append({"channel": 9, "program": 0, "notes": notes})   # GM percussion
        else:
            tracks.append({"channel": ch if ch < 9 else ch + 1, "program": patch.get("program", 80), "notes": notes})
            ch += 1
    return tracks


def render_file(path, sr=A.SR):
    """Render one song; writes its .mid into out/bgm/ and returns (name, L, R, bpm, beats)."""
    name = os.path.splitext(os.path.basename(path))[0]
    spec = json.load(open(path, encoding="utf-8"))
    left, right, bpm, beats = render_song(spec, sr)
    M.write_midi(os.path.join(A.out_dir("bgm"), name + ".mid"), to_midi_tracks(spec), bpm=bpm)
    return name, left, right, bpm, beats


def render_all(sr=A.SR):
    """Render every templates/bgm/*.json -> out/bgm/<name>.wav (+ .mid). Returns [(name, dur)]."""
    od = A.out_dir("bgm")
    done = []
    for fn in sorted(os.listdir(BGM_DIR)):
        if not fn.lower().endswith(".json"):
            continue
        name, left, right, bpm, beats = render_file(os.path.join(BGM_DIR, fn), sr)
        dur = A.write_wav(os.path.join(od, name + ".wav"), [left, right], sr)
        done.append((name, dur))
    return done


if __name__ == "__main__":
    for name, dur in render_all():
        print(f"  bgm {name}: {dur:.2f}s -> out/bgm/{name}.wav (+ .mid)")

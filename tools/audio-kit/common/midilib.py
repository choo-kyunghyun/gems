#!/usr/bin/env python3
"""midilib — minimal Standard MIDI File (Type 1) writer (pure Python stdlib).

The music renderer (music.py) renders a song template to a playable WAV *and*
exports the same note data as a real `.mid` here — the editable "MIDI base" the
score came from (GameMaker can't play .mid, so the WAV is the engine asset; the
.mid opens in any DAW/tracker for tweaking). Notes/durations are in beats
(quarter notes); tempo + a per-track program change are written for you.
"""
import struct


def _vlq(n):
    """MIDI variable-length quantity (7 bits/byte, high bit = continue)."""
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def _chunk(typ, data):
    return typ + struct.pack(">I", len(data)) + data


def write_midi(path, tracks, bpm=120, ppq=480):
    """tracks: list of dicts {channel, program, notes:[(midi, start_beat, dur_beat, vel), ...]}.
    Emits a Type-1 SMF: a tempo track + one MTrk per track. vel is 0..127."""
    out = bytearray(_chunk(b"MThd", struct.pack(">HHH", 1, len(tracks) + 1, ppq)))

    # --- conductor track: tempo (microseconds per quarter note) + end ---
    tempo = int(60000000 / bpm)
    tt = bytearray()
    tt += _vlq(0) + b"\xFF\x51\x03" + struct.pack(">I", tempo)[1:]   # 24-bit tempo
    tt += _vlq(0) + b"\xFF\x2F\x00"
    out += _chunk(b"MTrk", bytes(tt))

    # --- one MTrk per instrument track ---
    for tr in tracks:
        ch = tr.get("channel", 0) & 0x0F
        ev = []
        for (midi, sb, db, vel) in tr["notes"]:
            on = int(round(sb * ppq))
            off = int(round((sb + db) * ppq))
            if off <= on:
                off = on + 1
            ev.append((on, 1, midi, max(1, min(127, int(vel)))))   # 1 = note-on
            ev.append((off, 0, midi, 0))                            # 0 = note-off
        ev.sort(key=lambda e: (e[0], e[1]))     # at a tie, note-off before note-on

        td = bytearray(_vlq(0) + bytes((0xC0 | ch, tr.get("program", 0) & 0x7F)))
        prev = 0
        for (tick, kind, midi, vel) in ev:
            delta = tick - prev
            prev = tick
            status = (0x90 if kind else 0x80) | ch
            td += _vlq(delta) + bytes((status, midi & 0x7F, vel & 0x7F))
        td += _vlq(0) + b"\xFF\x2F\x00"
        out += _chunk(b"MTrk", bytes(td))

    with open(path, "wb") as f:
        f.write(bytes(out))
    return path

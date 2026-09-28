# Audio

This is what a sound has to be to sit in the shipped set. There is no code here. Synthesize in a
throwaway script (numpy + scipy) kept outside the repository, write a WAV, and import it as a
`GMSound`. The IDE is also where the audio group and compression are chosen.

## Format

| | SFX (`snd*`) | music (`mus*`) |
|---|---|---|
| Channels | mono, since the engine positions it in the world | stereo |
| Encoding | 16-bit PCM WAV, 44.1 kHz | the same |
| Length | a one-shot with its tail trimmed | a seamless loop of 32 or 48 s |
| Compression | 0 | 1 |

## Levels

Level a sound by its measured loudness, never by guessed gain. Loudness is A-weighted (the
IEC 61672 A-curve, applied in the frequency domain):

- One-shot: measure the loudest 200 ms window, in dBA/200 ms. Whole-buffer energy makes a 300 ms
  cue read 10 dB under a 100 ms one at the same loudness.
- Bed or loop: measure the whole buffer, in dBA.

Level a one-shot to a peak ceiling and a loudness ceiling at once, whichever binds first:
`gain = min(peak_target − peak, loud_target − loudness)`. An impulse ends up bound by its peak and
a sustained sound by its loudness. Matching peaks alone puts a coin chirp above a gunshot.

The shipped set sits on this ladder. To place a new sound, measure a shipped neighbour and match it.

| tier | dBA/200 ms | examples |
|---|---|---|
| heavy | −22 … −24 | explosions, gunfire, thunder, siren; peak −1.5 … −3 dBFS |
| cue | −26 … −29 | build, door, alert, achievement, eat, notify |
| action | −28 … −33 | hits, equip, pickup, toggle, reload; impacts peak-bound at −3.5 … −5 dBFS |
| quiet | −34 … −44 | footsteps, button click, select, tick, dialogue blip, heartbeat |

Music measures −24 … −36 dBA over the whole buffer, with the peak at or below −1.5 dBFS. Ambient
beds sit at −26 … −36, and the scored tracks (`musOutpost`, `musRaid`, `musHibernation`) at
−24 … −27.

## Loops

A loop clicks unless all three of these rules hold. Getting two right sounds the same as none.

1. Whole cycles. Every oscillator and modulator completes a whole number of cycles per loop.
   Snap each frequency with `f → round(f·n/sr)·sr/n`, and give LFOs rates of `k·sr/n`. Pitch drift
   and level wander are sums or products of such whole-cycle sines.
2. Cyclic filters. Filter the signal laid end to end with itself and keep the second half, so
   the filter enters already settled. A swept filter tiles its cutoff track the same way, and a
   gate curve is smoothed with a window that wraps.
3. Folded tails. Whatever overhangs the end, such as a reverb tail or a late event, is added
   back onto the head. That turns the linear convolution into a circular one.

Some further rules:

- Never fade a loop. On a loop, the fade becomes the seam.
- Stereo from mono. Roll one channel against the other: 10–30 ms (the Haas spread) for tonal
  material, a third of the loop for a noise bed. This is legal only because the material is periodic.
- Cut the sub. Remove content below about 30 Hz with two cyclic high-pass passes. Pink and brown
  beds put most of their energy there, where it eats headroom and adds no loudness.
- Check the seam. After every change, measure the seam on the mono mix:
  `20·log10(|x[0] − x[−1]| / p99(|diff(x)|))`. At 0 dB or below, the seam is indistinguishable
  from any other sample step. Shipped loops measure −3.5 … −41 dB. The ear always catches a seam,
  and a spectrogram never shows one.

## One-shots

- Reverb on an SFX stays mono: use a mono impulse response, since a stereo reverb breaks positioning.
- Balance the layers inside a sound by measured level. Use RMS for a continuous layer and peak for
  a sparse one, because RMS over mostly-silence measures the silence.
- Finish in this order:
  1. a few ms of out-fade, which kills the click of a non-zero last sample;
  2. trim the silence that convolution leaves on the tail;
  3. level last. Fading after levelling drops the peak of any attack inside the fade.
- A naive oscillator aliases on a fast sweep through the high register. Use band-limited
  (additive) saws and squares.
- Seed noise from a stable hash of the sound's name, such as crc32. Python's `hash()` is randomized
  per process.

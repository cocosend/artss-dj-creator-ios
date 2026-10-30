"""Reproducible, original starter PCM kit. Runs at development time, never in JS."""
from pathlib import Path
import math
import random
import struct
import wave

RATE = 48000
DEST = Path(__file__).resolve().parents[1] / 'modules/artss-audio/assets'
DEST.mkdir(parents=True, exist_ok=True)


def write(name, duration, sound):
    rng = random.Random(name)
    samples = [sound(i / RATE, rng) for i in range(round(duration * RATE))]
    # Remove DC and apply short edge fades before peak normalization.
    mean = sum(samples) / len(samples)
    samples = [(s - mean) * min(1, i / 24, (len(samples) - 1 - i) / 192)
               for i, s in enumerate(samples)]
    peak = max(abs(s) for s in samples)
    pcm = b''.join(struct.pack('<h', round(s * 0.85 / peak * 32767)) for s in samples)
    with wave.open(str(DEST / (name + '.wav')), 'wb') as out:
        out.setparams((1, 2, RATE, len(samples), 'NONE', 'not compressed'))
        out.writeframes(pcm)


def sine(hz, t):
    return math.sin(math.tau * hz * t)


def kick(t, rng):
    phase = math.tau * (48 * t + 2.9 * (1 - math.exp(-t / 0.022)))
    return math.sin(phase) * math.exp(-t / 0.18) + rng.uniform(-1, 1) * math.exp(-t / 0.002) * 0.16


def snare(t, rng):
    return (0.7 * rng.uniform(-1, 1) * math.exp(-t / 0.064) +
            (sine(185, t) + 0.4 * sine(330, t)) * math.exp(-t / 0.038))


def clap(t, rng):
    bursts = sum(math.exp(-(t - offset) / 0.012) if t >= offset else 0
                 for offset in (0, 0.012, 0.025))
    return rng.uniform(-1, 1) * (bursts + 0.5 * math.exp(-t / 0.06))


def hat(t, rng, decay):
    metallic = sum(sine(hz, t) for hz in (4127, 5273, 6503, 7879, 9341, 10903)) / 6
    return (metallic + rng.uniform(-1, 1) * 0.7) * math.exp(-t / decay)


write('kick', 0.85, kick)
write('snare', 0.38, snare)
write('clap', 0.32, clap)
write('closed-hat', 0.18, lambda t, rng: hat(t, rng, 0.024))
write('open-hat', 0.72, lambda t, rng: hat(t, rng, 0.16))
write('low-tom', 0.62, lambda t, rng: math.sin(math.tau * (72 * t + 0.5 * (1 - math.exp(-t / 0.04)))) * math.exp(-t / 0.12))
write('rim', 0.2, lambda t, rng: (sine(1750, t) + 0.7 * sine(680, t)) * math.exp(-t / 0.014))
write('shaker', 0.16, lambda t, rng: rng.uniform(-1, 1) * (1 - math.exp(-t / 0.003)) * math.exp(-t / 0.028))
print('Generated eight 48 kHz PCM starter samples.')

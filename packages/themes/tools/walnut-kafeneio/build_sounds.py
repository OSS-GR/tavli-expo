"""Build the sound effects of the Walnut Kafeneio theme.

The finished files are already in ../../walnut-kafeneio/sounds/. Run this only
to change a sound.

Usage (from the repo root):
  1. Download the CC0 sources into a cache folder (checks every SHA-256):
       python3 -I packages/themes/tools/walnut-kafeneio/build_sounds.py --download /tmp/sfx-cache
  2. Cut, mix, normalize and encode them into walnut-kafeneio/sounds/:
       python3 -I packages/themes/tools/walnut-kafeneio/build_sounds.py /tmp/sfx-cache

Needs Python 3 with numpy, and ffmpeg with the native AAC encoder.
All sources are CC0 1.0. packages/themes/LICENSES.md lists each one.

Output: mono AAC-LC in .m4a, 44.1 kHz, 64 kbit/s. expo-audio plays this on
iOS and Android, and Metro bundles .m4a as an asset by default.

Levels: every clip is peak-normalized to its own target (PEAK_DB). Board
sounds sit near -3 dBFS. Quiet cues (turn start, dice land, invalid move) sit
lower, so a game never sounds busy.
"""

import hashlib
import os
import subprocess
import sys
import tempfile
import urllib.request
import wave
import zipfile

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "..", "walnut-kafeneio", "sounds"))

# cache file: (url, sha256)
SOURCES = {
    "kenney_casino-audio.zip": (
        "https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip",
        "f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18",
    ),
    "kenney_impact-sounds.zip": (
        "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip",
        "029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8",
    ),
    "kenney_music-jingles.zip": (
        "https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip",
        "b729ba57959bd58793d2c5cafa348aaf2655d354f3da35ec4729e03ec77197b8",
    ),
    "wuzzy-dice-1.flac": (
        "https://opengameart.org/sites/default/files/Holzw%C3%BCrfel_auf_Holztisch_1.flac",
        "c645a3a25eb9523e5a86495faf71edf30a5d509ca0ba62388d132b8ca1ff7551",
    ),
    "wuzzy-dice-3.flac": (
        "https://opengameart.org/sites/default/files/Holzw%C3%BCrfel_auf_Holztisch_3.flac",
        "283bc098ebdff423512dd7f9a825b711dc8466b84b35dc42f71538a485bfd57d",
    ),
    "wuzzy-dice-4.flac": (
        "https://opengameart.org/sites/default/files/Holzw%C3%BCrfel_auf_Holztisch_4.flac",
        "7d2d2332bc5f3ae57c151e07526956993c6647dc9795bd35ec3b99f8229fabda",
    ),
    "boardgame_piece_wobbles.zip": (
        "https://opengameart.org/sites/default/files/boardgame_piece_wobbles.zip",
        "46e638896e435ba927f297dc7a01551be18ac8dff8e0ff7e93ea6aaa0873beac",
    ),
}

# Members we read from the zips: short name -> (zip, member).
ZIP_MEMBERS = {
    "dice-grab-1": ("kenney_casino-audio.zip", "Audio/dice-grab-1.ogg"),
    "wood-light-0": ("kenney_impact-sounds.zip", "Audio/impactWood_light_000.ogg"),
    "wood-light-2": ("kenney_impact-sounds.zip", "Audio/impactWood_light_002.ogg"),
    "wood-medium-0": ("kenney_impact-sounds.zip", "Audio/impactWood_medium_000.ogg"),
    "pizzi-10": ("kenney_music-jingles.zip", "Audio/Pizzicato jingles/jingles_PIZZI10.ogg"),
    "steel-10": ("kenney_music-jingles.zip", "Audio/Steel jingles/jingles_STEEL10.ogg"),
    "wobble02": ("boardgame_piece_wobbles.zip", "boardgame piece wobbles/wobble02.ogg"),
    "wobble03": ("boardgame_piece_wobbles.zip", "boardgame piece wobbles/wobble03.ogg"),
    "wobble04": ("boardgame_piece_wobbles.zip", "boardgame piece wobbles/wobble04.ogg"),
    "wobble05": ("boardgame_piece_wobbles.zip", "boardgame piece wobbles/wobble05.ogg"),
}

# Output file -> peak level in dBFS.
PEAK_DB = {
    "checker-place-1": -3.0,
    "checker-place-2": -3.0,
    "checker-place-3": -3.0,
    "checker-hit": -1.5,
    "bear-off": -3.0,
    "dice-roll-1": -3.0,
    "dice-roll-2": -3.0,
    "dice-land": -10.0,
    "invalid-move": -9.0,
    "turn-start": -10.0,
    "game-win": -10.0,
    "match-win": -9.0,
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def download(cache):
    os.makedirs(cache, exist_ok=True)
    for name, (url, digest) in SOURCES.items():
        path = os.path.join(cache, name)
        if not os.path.exists(path):
            print("download", url)
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as r, open(path, "wb") as f:
                f.write(r.read())
        if sha256(path) != digest:
            sys.exit(f"{name}: SHA-256 does not match. Delete it and download again.")
    print("sources ok in", cache)


def source_path(cache, tmp, name):
    """A file on disk for a source name: a cached file or a zip member."""
    if name in ZIP_MEMBERS:
        zname, member = ZIP_MEMBERS[name]
        out = os.path.join(tmp, name + os.path.splitext(member)[1])
        if not os.path.exists(out):
            with zipfile.ZipFile(os.path.join(cache, zname)) as z, open(out, "wb") as f:
                f.write(z.read(member))
        return out
    path = os.path.join(cache, name)
    if not os.path.exists(path):
        sys.exit(f"missing source {path}: run with --download first")
    return path


class Loader:
    def __init__(self, cache, tmp):
        self.cache = cache
        self.tmp = tmp

    def __call__(self, name, filters="", rate=1.0):
        """Mono float32 at SR. `rate` > 1 plays faster and higher (tape style)."""
        chain = ["highpass=f=90"]
        if rate != 1.0:
            chain.append(f"asetrate={int(SR * rate)},aresample={SR}")
        if filters:
            chain.append(filters)
        raw = subprocess.run(
            [
                "ffmpeg", "-v", "error", "-i", source_path(self.cache, self.tmp, name),
                "-ac", "1", "-ar", str(SR), "-af", ",".join(chain), "-f", "f32le", "-",
            ],
            capture_output=True,
            check=True,
        ).stdout
        return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def ms(t):
    return int(round(t * SR / 1000))


def cut(x, start_ms, length_ms, fade_in_ms=2, fade_out_ms=40):
    """A slice with short linear fade-in and a smooth (cosine) fade-out."""
    y = x[ms(start_ms): ms(start_ms) + ms(length_ms)].copy()
    fi, fo = min(ms(fade_in_ms), len(y)), min(ms(fade_out_ms), len(y))
    if fi:
        y[:fi] *= np.linspace(0, 1, fi)
    if fo:
        y[-fo:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fo)))
    return y


def mix(*parts):
    """parts: (signal, offset_ms, gain_db)."""
    length = max(ms(off) + len(sig) for sig, off, _ in parts)
    out = np.zeros(length)
    for sig, off, gain in parts:
        out[ms(off): ms(off) + len(sig)] += sig * 10 ** (gain / 20)
    return out


def gate(x, threshold_db, floor_db=-30.0, attack_ms=1.0, release_ms=40.0):
    """Downward gate: lowers the hiss between hits to `floor_db`."""
    env = np.abs(x)
    a, r = np.exp(-1 / ms(attack_ms)), np.exp(-1 / ms(release_ms))
    smooth = np.zeros_like(env)
    level = 0.0
    for i, v in enumerate(env):
        level = a * level + (1 - a) * v if v > level else r * level + (1 - r) * v
        smooth[i] = level
    db = 20 * np.log10(smooth + 1e-9)
    gain = np.where(db > threshold_db, 1.0, 10 ** (floor_db / 20))
    # Smooth the gain so it never clicks.
    k = ms(4)
    gain = np.convolve(gain, np.ones(k) / k, mode="same")
    return x * gain


def build(load):
    w2, w3, w4, w5 = (load(f"wobble0{i}") for i in (2, 3, 4, 5))
    body = cut(load("wood-light-0", "lowpass=f=1800"), 0, 140, 1, 90)
    body2 = cut(load("wood-light-2", "lowpass=f=1800"), 0, 140, 1, 90)

    # Checker place: single taps of a wooden piece on a wooden table, with a
    # little low wood body under each for weight. Three takes, played in turn.
    tap_a = cut(w4, 170, 190, 1, 110)
    tap_b = cut(w3, 497, 190, 1, 110)
    tap_c = cut(w5, 131, 190, 1, 110)
    tap_d = cut(w2, 548, 190, 1, 110)
    tap_e = cut(w5, 737, 170, 1, 100)
    sounds = {
        "checker-place-1": mix((tap_a, 0, 0), (body, 0, -14)),
        "checker-place-2": mix((tap_b, 0, 0), (body2, 0, -14)),
        "checker-place-3": mix((tap_c, 0, 0), (body, 0, -16)),
    }

    # Hit: a harder clack, then the hit checker knocks against its neighbor.
    medium = cut(load("wood-medium-0", "lowpass=f=2500"), 0, 180, 1, 110)
    sounds["checker-hit"] = mix((tap_d, 0, 0), (medium, 0, -9), (tap_e, 62, -7), (tap_a, 118, -15))

    # Bear off: the checker drops into the wooden tray. Lower, rounder, a small rattle.
    tray = cut(load("wood-light-0", "lowpass=f=1200", rate=0.82), 0, 260, 1, 160)
    sounds["bear-off"] = mix((tray, 0, -2), (tap_b, 6, -8), (cut(w4, 170, 120, 1, 80), 85, -17))

    # Dice: real wooden dice on a wooden table. Two takes per roll, mixed as two
    # dice. Fits the 650 ms roll animation and fades out as they settle.
    d1 = gate(load("wuzzy-dice-1.flac", "afftdn=nf=-30"), -26)
    d3 = gate(load("wuzzy-dice-3.flac", "afftdn=nf=-40"), -30)
    d4 = gate(load("wuzzy-dice-4.flac"), -40)
    sounds["dice-roll-1"] = cut(mix((cut(d3, 120, 720, 3, 200), 0, 0), (cut(d4, 80, 560, 3, 200), 55, -3)), 0, 780, 1, 120)
    sounds["dice-roll-2"] = cut(mix((cut(d1, 40, 520, 3, 180), 0, 0), (cut(d3, 400, 560, 3, 200), 30, -2)), 0, 740, 1, 120)
    # Land: the last small "tock" of the dice coming to rest.
    sounds["dice-land"] = mix((cut(d4, 270, 90, 1, 60), 0, 0), (cut(d3, 1262, 90, 1, 60), 48, -3))

    # Invalid move: a soft, muted double knock ("no-no"), lower than the board sounds.
    knock = cut(load("wobble04", "lowpass=f=900", rate=0.8), 212, 160, 1, 110)
    sounds["invalid-move"] = mix((knock, 0, 0), (knock, 125, -3))

    # Turn start: picking up the dice, very quiet.
    sounds["turn-start"] = cut(load("dice-grab-1", "lowpass=f=6000"), 190, 330, 30, 160)

    # Wins: pizzicato strings, D major going up.
    pizzi = load("pizzi-10")
    steel = load("steel-10", "lowpass=f=5000")
    sounds["game-win"] = cut(mix((pizzi, 0, 0), (steel, 0, -14)), 0, 900, 1, 220)
    # Match win: the same run, then once more a fifth higher (D E F# G, A B C# D).
    pizzi_up = load("pizzi-10", rate=1.5)
    steel_up = load("steel-10", "lowpass=f=6000", rate=1.5)
    run = mix((pizzi, 0, 0), (steel, 0, -14), (pizzi_up, 500, -1), (steel_up, 500, -9))
    sounds["match-win"] = cut(run, 0, 1500, 1, 350)
    return sounds


def normalize(x, peak_db):
    peak = np.max(np.abs(x))
    return x * (10 ** (peak_db / 20) / peak)


def write_m4a(x, path, tmp):
    wav = os.path.join(tmp, "out.wav")
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype("<i2")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", "-i", wav, "-c:a", "aac", "-b:a", "64k",
            "-ac", "1", "-ar", str(SR), "-map_metadata", "-1", "-fflags", "+bitexact",
            "-flags:a", "+bitexact", "-movflags", "+faststart", path,
        ],
        check=True,
    )


def main(argv):
    if len(argv) == 3 and argv[1] == "--download":
        download(argv[2])
        return
    if len(argv) != 2:
        sys.exit(__doc__)
    cache = argv[1]
    for name, (_, digest) in SOURCES.items():
        path = os.path.join(cache, name)
        if not os.path.exists(path) or sha256(path) != digest:
            sys.exit(f"{path} is missing or changed: run with --download first")
    os.makedirs(OUT_DIR, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        sounds = build(Loader(cache, tmp))
        if set(sounds) != set(PEAK_DB):
            sys.exit(f"sounds and PEAK_DB differ: {sorted(set(sounds) ^ set(PEAK_DB))}")
        total = 0
        for name, x in sounds.items():
            path = os.path.join(OUT_DIR, name + ".m4a")
            write_m4a(normalize(x, PEAK_DB[name]), path, tmp)
            size = os.path.getsize(path)
            total += size
            print(f"{name + '.m4a':22s} {len(x) / SR * 1000:5.0f} ms {size / 1024:5.1f} KB")
        print(f"total {total / 1024:.1f} KB in {OUT_DIR}")


if __name__ == "__main__":
    main(sys.argv)

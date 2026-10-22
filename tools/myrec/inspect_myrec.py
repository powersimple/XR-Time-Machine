"""Summarize an ENGAGE .myrec spatial recording without extracting it to disk.

Usage: python3 -I tools/myrec/inspect_myrec.py <file.myrec> [--stream N] [--trajectory out.svg]

Layout (see docs/myrec-format.md):
  outer zip: count.txt, master, stream0..N-1, [streamvideo0..N-1]
  each master/streamN entry is itself a zip holding one or more files:
    master.txt       JSON manifest (roster, timing, scene id)
    stream.msp       MessagePack, LZ4BlockArray (MessagePack-CSharp), per-frame avatar poses
    events.txt       JSON, per-frame object/media/reaction events + initial scene state
    whiteboard.msp   MessagePack whiteboard strokes
    audioothers.mp3  mixed session audio for this chunk
  streamvideoN is a raw H.264 Annex-B elementary stream (in-world screen video).
"""
import io
import json
import os
import struct
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import msp  # noqa: E402


def half(v):
    return struct.unpack("<e", struct.pack("<H", v))[0]


def inner(z, name):
    iz = zipfile.ZipFile(io.BytesIO(z.read(name)))
    return {n: iz.read(n) for n in iz.namelist()}


def master(z):
    files = inner(z, "master")
    return json.loads(files["master.txt"].decode("utf-8-sig"))


def frames(z, n):
    files = inner(z, f"stream{n}")
    obj, _ = msp.load_bytes(files["stream.msp"])
    return obj[0], files


def player_frame(rec):
    """One player's record in one frame -> dict. Field meanings past root/head/hands are partly guessed."""
    player, body, flags, extra = rec
    root = body[0]
    out = {"player": player, "root_pos": root[0], "root_rot": root[1]}
    if body[1]:
        out["bones"] = [
            {"bone": b[0], "pos": [half(x) for x in b[1]], "rot": [half(x) for x in b[2]], "scale": [half(x) for x in b[3]]}
            for b in body[1][0]
        ]
    if body[2]:
        out["trackers"] = [{"pos": [half(x) for x in t[0]], "rot": [half(x) for x in t[1]]} for t in body[2]]
    out["flags"] = flags
    out["extra"] = extra
    return out


def summary(path, stream=None):
    z = zipfile.ZipFile(path)
    m = master(z)
    roster = m.get("avatar_variables_v1") or m.get("avatar_variables_v0") or {}
    T = float(m.get("totalTime", 0))
    F = int(m.get("totalFrames", 0))
    names = z.namelist()
    print(f"{os.path.basename(path)}")
    print(f"  format {m.get('recording_version_string')} v{m.get('recording_version')}, scene {m.get('sceneID')}")
    print(f"  {len(m.get('recordingStreamFrames', []))} chunks, {F} frames, {T / 60:.1f} min, {F / T if T else 0:.1f} fps")
    print(f"  {sum(n.startswith('streamvideo') for n in names)} video chunks")
    print(f"  {len(roster)} participants:")
    for k, v in roster.items():
        mode = "VR 6DoF" if v.get("is6Dof") == "True" else "desktop/mobile"
        print(f"    #{k:>3} {v.get('name', '?')[:24]:24} {mode:15} joins frame {v.get('playerStartFrame')}")
    if stream is not None:
        fr, files = frames(z, stream)
        print(f"  stream{stream}: {len(fr)} frames; inner files {sorted(files)}")
        full = sum(1 for f in fr if any(p[1][1] for p in f[0]))
        print(f"    frames with full-body bone poses: {full}")
        print(json.dumps(player_frame(fr[0][0][0]), default=str)[:600])


def trajectory_svg(path, out, max_chunks=None):
    """Top-down plot of every avatar's root position across the recording."""
    z = zipfile.ZipFile(path)
    n = len(master(z).get("recordingStreamFrames", []))
    tracks = {}
    for i in range(n if max_chunks is None else min(n, max_chunks)):
        fr, _ = frames(z, i)
        for f in fr[::10]:
            for rec in f[0]:
                p = rec[1][0][0]
                tracks.setdefault(rec[0], []).append((p[0], p[2]))
    pts = [p for t in tracks.values() for p in t]
    xs, zs = [p[0] for p in pts], [p[1] for p in pts]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    W = 800
    s = W / max(x1 - x0, z1 - z0, 1e-6)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 {W + 20} {W + 20}" style="background:#111">']
    for idx, (pid, t) in enumerate(sorted(tracks.items())):
        hue = (idx * 47) % 360
        d = " ".join(f"{(x - x0) * s:.1f},{(z1 - zz) * s:.1f}" for x, zz in t)
        svg.append(f'<polyline fill="none" stroke="hsl({hue},80%,60%)" stroke-width="1.2" stroke-opacity="0.8" points="{d}"/>')
    svg.append("</svg>")
    open(out, "w").write("\n".join(svg))
    print(f"wrote {out}: {len(tracks)} avatars, {len(pts)} points")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(1)
    s = int(args[args.index("--stream") + 1]) if "--stream" in args else None
    summary(args[0], s)
    if "--trajectory" in args:
        trajectory_svg(args[0], args[args.index("--trajectory") + 1])

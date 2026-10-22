"""Convert an ENGAGE .myrec spatial recording into an XR Time Machine recording folder, for the studio and editors.

Usage: python3 -I ENGAGE/tools/convert_myrec.py <file.myrec> <out folder> [--minutes 2] [--start 0]

What carries over:
  - every participant's root position and heading, per frame, with joins and leaves
  - the session's audio, which ENGAGE stores as ONE mixed track: it becomes a "Room audio (mixed)" participant
    with no position, so it plays mic'd in every mix. There are no per-speaker stems, so no speech turns either.
What doesn't (yet):
  - bone poses: ENGAGE's 50-bone skeleton isn't mapped to a rig, so avatars render as capsules
  - objects, media, whiteboards (in events.txt / whiteboard.msp)
Assumption: ENGAGE's root sits at hip height (~1.05 m above the floor), so positions are lowered by ROOT_HEIGHT.
Audio decoding uses macOS's afconvert.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import msp  # noqa: E402

ROOT_HEIGHT = 1.05


def inner(z, name):
    iz = zipfile.ZipFile(io.BytesIO(z.read(name)))
    return {n: iz.read(n) for n in iz.namelist()}


def convert(path, out, minutes=2.0, start_min=0.0):
    z = zipfile.ZipFile(path)
    m = json.loads(inner(z, "master")["master.txt"].decode("utf-8-sig"))
    roster = m.get("avatar_variables_v1") or m.get("avatar_variables_v0") or {}
    starts = [float(x) for x in m["recordingStreamStartTimes"]]
    durs = [float(x) for x in m["recordingStreamTimes"]]
    t0, t1 = start_min * 60, start_min * 60 + minutes * 60
    chunks = [i for i in range(len(starts)) if starts[i] + durs[i] > t0 and starts[i] < t1]
    if not chunks:
        raise SystemExit(f"Nothing between {start_min} and {start_min + minutes} minutes")
    os.makedirs(out, exist_ok=True)

    # The recording account's own avatar (often a "Camera" user parked at the origin), like a recorder bot: skip it.
    recorder = str(m.get("myPlayerInt", ""))
    present, seen, last_t = {}, {}, 0
    poses = open(os.path.join(out, "poses.jsonl"), "w")
    events = open(os.path.join(out, "events.jsonl"), "w")
    audio_parts = []
    pose_samples = 0
    for i in chunks:
        files = inner(z, f"stream{i}")
        frames, _ = msp.load_bytes(files["stream.msp"])
        frames = frames[0]
        if "audioothers.mp3" in files:
            audio_parts.append((starts[i], files["audioothers.mp3"]))
        for k, frame in enumerate(frames):
            t = starts[i] + durs[i] * k / max(1, len(frames))
            if t < t0 or t >= t1:
                continue
            ms = round((t - t0) * 1000)
            here = set()
            for rec in frame[0]:
                player, body = rec[0], rec[1]
                if str(player) == recorder:
                    continue
                root = body[0] if body else None
                if not root or not root[0]:
                    continue
                pid = f"engage-{player}"
                here.add(pid)
                if pid not in present:
                    present[pid] = True
                    seen.setdefault(pid, []).append({"joinedMs": ms})
                    events.write(json.dumps({"t": ms, "type": "peer_joined", "peer": pid, "name": name_of(roster, player), **({"rejoin": True} if len(seen[pid]) > 1 else {})}) + "\n")
                pos = [root[0][0], root[0][1] - ROOT_HEIGHT, root[0][2]]
                poses.write(json.dumps({"t": ms, "peer": pid, "pos": pos, "rot": list(root[1])}) + "\n")
                pose_samples += 1
            for pid in [p for p in present if p not in here]:
                del present[pid]
                seen[pid][-1]["leftMs"] = ms
                events.write(json.dumps({"t": ms, "type": "peer_left", "peer": pid}) + "\n")
            last_t = ms
    poses.close()

    duration_ms = round(min(t1, starts[chunks[-1]] + durs[chunks[-1]]) * 1000 - t0 * 1000)
    room = decode_audio(audio_parts, t0, duration_ms, os.path.join(out, "voice-room.wav"))
    if room:
        events.write(json.dumps({"t": 0, "type": "peer_joined", "peer": "room", "name": "Room audio (mixed)"}) + "\n")
    events.close()

    peers = {}
    for pid, sessions in seen.items():
        player = pid.split("-", 1)[1]
        peers[pid] = {"displayName": name_of(roster, player), "userId": None, "profile": roster.get(player, {}).get("avatarSDKURL"),
                      "sessions": sessions, "joinedMs": sessions[0]["joinedMs"], **({"leftMs": sessions[-1]["leftMs"]} if "leftMs" in sessions[-1] else {}),
                      "voiceFile": None}
    if room:
        peers["room"] = {"displayName": "Room audio (mixed)", "userId": None, "profile": None, "sessions": [{"joinedMs": 0}], "joinedMs": 0, "voiceFile": "voice-room.wav"}
    session = {
        "format": "xr-time-machine-dev", "version": 1, "status": "complete",
        "label": f"{os.path.splitext(os.path.basename(path))[0]} {start_min:g}-{start_min + minutes:g} min",
        "recordedAt": None, "source": {"platform": "engage", "boneCodec": None, "file": os.path.abspath(path), "sceneID": m.get("sceneID")},
        "startClockMs": 0, "clock": "converted", "poseHz": 30, "voiceSampleRate": 48000, "poseSamples": pose_samples,
        "durationMs": duration_ms, "peers": peers,
    }
    with open(os.path.join(out, "session.json"), "w") as f:
        json.dump(session, f, indent=2)
    return session


def name_of(roster, player):
    return roster.get(str(player), {}).get("name") or f"Player {player}"


def decode_audio(parts, t0, duration_ms, out_wav):
    """Decode each chunk's MP3 on its own (each has its own encoder padding, so gluing them would drift) and place
    it at its chunk's start time on the output timeline. Uses macOS's afconvert."""
    if not parts or not shutil.which("afconvert"):
        return False
    total = round(duration_ms * 48)
    out = bytearray(total * 2)
    with tempfile.TemporaryDirectory() as tmp:
        for n, (start, data) in enumerate(parts):
            mp3, wav = os.path.join(tmp, f"{n}.mp3"), os.path.join(tmp, f"{n}.wav")
            with open(mp3, "wb") as f:
                f.write(data)
            subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@48000", "-c", "1", mp3, wav], check=True, capture_output=True)
            pcm = wav_data(open(wav, "rb").read())
            at = round((start - t0) * 48000)
            if at < 0:
                pcm, at = pcm[-at * 2:], 0
            pcm = pcm[: max(0, (total - at) * 2)]
            out[at * 2: at * 2 + len(pcm)] = pcm
    header = b"RIFF" + (36 + len(out)).to_bytes(4, "little") + b"WAVEfmt " + (16).to_bytes(4, "little") + (1).to_bytes(2, "little") + (1).to_bytes(2, "little") \
        + (48000).to_bytes(4, "little") + (96000).to_bytes(4, "little") + (2).to_bytes(2, "little") + (16).to_bytes(2, "little") + b"data" + len(out).to_bytes(4, "little")
    with open(out_wav, "wb") as f:
        f.write(header + bytes(out))
    return True


def wav_data(data):
    """The PCM bytes of a WAV's data chunk (afconvert may write other chunks first)."""
    pos = 12
    while pos < len(data) - 8:
        cid, size = data[pos:pos + 4], int.from_bytes(data[pos + 4:pos + 8], "little")
        if cid == b"data":
            return data[pos + 8:pos + 8 + size]
        pos += 8 + size + (size & 1)
    return b""


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    opt = lambda name, d: float(args[args.index(name) + 1]) if name in args else d  # noqa: E731
    s = convert(args[0], args[1], minutes=opt("--minutes", 2.0), start_min=opt("--start", 0.0))
    people = [p["displayName"] for k, p in s["peers"].items() if k != "room"]
    print(f"Converted {s['label']}: {s['durationMs'] / 1000:.1f} s, {len(people)} people, {s['poseSamples']} pose samples → {args[1]}")

# ENGAGE plugin

Reads ENGAGE spatial recordings (`.myrec`). The format notes are in [docs/myrec-format.md](docs/myrec-format.md).

```bash
python3 -I tools/inspect_myrec.py <file.myrec>                    # roster, timing, frame rate
python3 -I tools/inspect_myrec.py <file.myrec> --stream 100       # decode one chunk's poses
python3 -I tools/inspect_myrec.py <file.myrec> --trajectory out.svg
```

The tools are pure Python with no dependencies; [tools/msp.py](tools/msp.py) decodes MessagePack and LZ4.

**Next:** a converter from `.myrec` to the XR Time Machine recording format, so ENGAGE archives open in the same editors. Positional fields are partly unidentified (see the format notes). ENGAGE stores only a mixed audio track, so imported recordings won't have per-speaker stems.

<!-- Parent: ../../AGENTS.md -->

# tools/observability/capture/ui — deterministic mode-aware UI driver

**The problem this fixes:** `../ab_capture.sh` drives exactly one photo cycle (`am start` +
`KEYCODE_CAMERA`). The open symptoms don't live in that cycle — they live in **8K video** (#8),
**back-to-back capture** (#4 UAF), **video/night** (G8). You cannot A/B a symptom you can't reach,
and an A/B is only valid if both sides got the *same* stimulus.

**Strategy (hybrid, by design):**
1. **Intent + keyevent first** — build-independent, byte-identical on OOS and LOS. Launch + shutter
   never depend on a resource-id.
2. **uiautomator resource-id tap fallback** — only for steps intents can't express (mode tabs, the
   8K toggle, night). Because OplusCamera resource-ids can differ between stock and a port, those ids
   live in `resmap.sh`, keyed per build, and **every action is written to `/data/local/tmp/obs_ui_action.log`** so
   you can prove the two runs were equivalent even when a tap coordinate differed.

## Mode → symptom map
| Mode | Drives | Attribution row |
|------|--------|-----------------|
| `photo` | single still | #2 (hdr_detected / JPEG baseline) |
| `burst` | 4 rapid shutters | #4 (back-to-back `copyMetadata` UAF) |
| `video` | record start/stop | preview/record baseline |
| `video8k` | 8K record | **#8 (`configure_streams(0x80a9)` −38)** — needs `RID_8K_TOGGLE` filled |
| `night` | MORE → NIGHT → shutter | G8 (long-exposure finalize) |
| `switch` | lens switch + capture | reconfigure path |

## Use
```sh
# fill resmap.sh for THIS build first (only the ids you need):
adb shell uiautomator dump /sdcard/u.xml && adb pull /sdcard/u.xml   # grep resource-id=
# push the capture kit and drive a mode:
adb push tools/observability/capture /data/local/tmp/obs-capture
adb shell su -c 'sh /data/local/tmp/obs-capture/ui/drive_cycle.sh video8k'
adb pull /data/local/tmp/obs_ui_action.log     # audit: same actions both sides?
```
Run the **same mode** on OOS and on LOS, inside whatever capture window you're using
(`../ab_capture.sh`, `../../strace/`, frida). The action log is the proof the stimulus matched.

## Notes
- Leaving a `RID_*` empty in `resmap.sh` makes that step **fall back or skip with a logged note** —
  the driver never hard-fails, so a partially-filled map still produces a usable (narrower) run.
- `video8k` without `RID_8K_TOGGLE` filled records ordinary video and logs the gap — it will **not**
  reproduce #8. Fill that id before trusting an 8K A/B.
- The SIGQUIT (`kill -3`) at the end dumps preview-thread state to `/data/anr` — that's the freeze
  (#1) signature; `../ab_capture.sh` and `parse_ab.py` pick it up.

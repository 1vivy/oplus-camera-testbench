<!-- Parent: ../INDEX.md -->

---
node: E5
title: "NCS (Non-Camera Sensors: gyro/accel/OIS) bridge → CamX GME / reprocess EIS-stabilization"
plane: facilitation
partition: mixed                  # sensor HAL (/vendor) + CamX NCS client (camxncs, in the byte-identical provider blob) + sensor service
blob_identical_oos_los: n/a       # this is a SERVICE/HAL plumbing item, not a camera .so edit (provider/CamX blobs are byte-identical OOS↔LOS)
characterization: UNCHARACTERIZED # only the GME consumer-side error is observed; the NCS client→sensor-service plumbing is unmapped
conviction: OPEN                  # feature-completeness facilitation; NOT a freeze root (see verdict); root claim unopened
verdict: "On both LOS AND the OOS golden, the camera reprocess GME node reports `hNCSDataHandle 0x0` / `Unable to get Gyro data` / `Invalid ois data, skip AlgoExecute` (~87/s, continuous). So missing NCS gyro/OIS to the offline reprocess is NON-DIVERGENT in the golden captures — it is NOT the post-capture freeze cause and NOT a golden-proven LOS regression. It is a worthy FORWARD facilitation for full reprocess EIS/video-stabilization (the GME motion-comp stage runs blind without it), to undertake/implement later — not a live blocker."
confidence: low
symptoms: []                      # no named symptom; a quality/feature gap (no reprocess stabilization), surfaced as background log noise
probes: []                        # TODO: hook FillGyroData / map camxncs → sensor service; compare a VIDEO-EIS scene OOS vs LOS (still-capture may legitimately need no gyro)
gaps: []
dodge_ref: ""                     # TODO: check dodge sensor/NCS plumbing as oracle
dirty_ref: ""
divergence: "UNKNOWN — golden still-capture shows the SAME hNCSDataHandle 0x0 as LOS; a video-EIS / motion scenario is needed to tell whether OOS ever feeds gyro to camera (i.e. whether the bridge is genuinely broken on LOS or simply unused in still capture)"
upstream: [C4, C5]                # C4 provider session config + C5 CamX/CHI reprocess graph select the GME node
downstream: [C6]                  # C6 APS/oemlayer reprocess consumes the (missing) stabilization
refuted_refs: []
doc_refs: []
updated: 2026-06-25
---

# E5 — NCS (Non-Camera Sensors) bridge for camera reprocess EIS/stabilization

**One-liner:** The CamX **GME** (Gyro Motion Estimation) node on the offline reprocess graph asks the **NCS**
(Non-Camera Sensors: gyro / accel / OIS) data source for per-frame motion data and gets a **NULL handle**
(`hNCSDataHandle 0x0`) → it skips stabilization. This is a **feature-completeness facilitation** (full reprocess
EIS / video stabilization), **not** a freeze root — the OOS golden shows the identical error, so it is non-divergent
in the captures we have.

## (b) Evidence — the GME consumer-side error
On-device (CPH2747, LOS v2.x, 2026-06-25), provider `vendor.qti.camera.provider-service_64` emits, **continuously
at ~87/s** from session start (NOT correlated to any freeze):
```
E ChiNode [GME] camxchinodegme.cpp:4994        FillGyroData() OplusOfflineReprocess0_com.qti.node.gme0_cam1  Unable to get Gyro data <reqID> dataSize 0 pGyroDataSource <ptr> hNCSDataHandle 0x0
E ChiNode [GME] opluscamxchinodesstabgme.cpp:3780 OplusProcessRequestSequenceIdTwo() OplusOfflineReprocess0_...gme0_cam1  Invalid ois data, skip AlgoExecute <reqID>
```
`_cam1` = front sensor; the rear path shows the `_cam2` analogue. `dataSize 0` + `hNCSDataHandle 0x0` ⇒ the NCS
data source never opened, so GME has no gyro/OIS vector and **skips** its algo (graceful skip, not a hang).

## (c) KEY FINDING — non-divergent on the OOS golden (trunk axiom)
The OOS golden capture store (`reference/_golden-oos-V16.1.0/`, build V16.1.0, genuine OxygenOS) shows the
**identical** error on BOTH cameras:
- rear portrait `campaign/portrait/run1/ab/logcat_all.txt`: `FillGyroData() OfflineReprocess0_com.qti.node.gme0_cam2 ... hNCSDataHandle 0x0`
- front selfie `campaign/selfie/run1/ab/logcat_all.txt`: `OplusOfflineReprocess0_com.qti.node.gme0_cam1 ... hNCSDataHandle 0x0` (all 12 hits NULL handle)

⇒ By the trunk axiom (a line present on the working OOS golden is not a LOS root), **missing NCS gyro/OIS is NOT
the freeze cause and NOT a regression these golden captures can prove.** Caveat: the golden's frida mask explicitly
**excludes SENSOR/NCS verbose**, so it logs sparsely there; and both golden lanes are *still* captures, where GME
stabilization may legitimately be a no-op. Whether OOS feeds gyro in a **video-EIS / motion** scenario (where it
would matter) is the open divergence test below.

## (d) Fact-to-resolve
1. Is an **NCS / sensor data-source service** for camera present on LOS at all? (CamX NCS client = `camxncs` inside
   the byte-identical provider blob; the *service* it connects to — sensor HAL / SSC / QMI sensor hub — is the
   suspect plumbing.) Map the `camxncs` → sensor-service path and where the handle creation fails.
2. Does OOS feed gyro to the camera in a **video / EIS** scene (not still capture)? Capture a video-EIS lane OOS vs
   LOS; if OOS provides a non-NULL `hNCSDataHandle` there and LOS does not, E5 becomes a real LOS facilitation.
3. Dodge oracle: does the dodge reference wire a sensor/NCS bridge for camera? (fill `dodge_ref`.)

## (e) Probes (TODO)
- Hook `CamX FillGyroData()` (`camxchinodegme.cpp:4994`) — capture `pGyroDataSource` / `hNCSDataHandle` lifecycle.
- Check sensor service presence: `dumpsys sensorservice`, sensor HAL service (`android.hardware.sensors`/SSC),
  and any `vendor.*.ncs` / camera-sensor bridge service in `ps -A` / `service list`.
- Compare a **video-EIS** capture OOS-golden vs LOS (the scenario where GME gyro actually drives output).

## Cross-links
- `../control/C5-camx-chi-feature2.md` (NCS bit23 is the CamX log group EXCLUDED for SIGSEGV-in-vfprintf reasons —
  the same NCS subsystem, here on the log-mask side).
- `../control/C4-hal-provider.md` (provider session config selects the reprocess graph that hosts GME).
- `../symptoms/S1-preview.md` (the post-capture freeze hunt that surfaced this as background noise — explicitly
  refuted there as the freeze cause).
- Forward home (Phase-2): a future `../../facilitation/F5-*` once characterized; this E5 is the diff-era node.

# v1.5 Camera Build Plan Draft

status: awaiting-approval
pending_action: write .omo/plans/v15-camera-build.md
created: 2026-06-16
mode: ulw-plan
tier: HEAVY

## Tier Facts

HEAVY is required because the work spans multiple repos and system surfaces:
`vendor_oplus_camera`, `android_frameworks_av`, `android_frameworks_native`,
`android_frameworks_base`, `android_hardware_oplus`, device/vendor blob sync,
runtime overlays, SurfaceFlinger/EDR, cameraserver extension, P010/APS, and
test-bench campaign tooling. The user also asked to reconcile
reverse-engineering notes and build-lineage findings before creating the v1.5
build.

Higher-tier facts checked and present:
- 3+ repos/surfaces affected.
- Reverse-engineering uncertainty affects implementation order.
- Device/manual QA is required to prove success.
- There are reference and dirty candidate sources that must be separated before
  clean-port decisions.

## Confirmed User Inputs

- Base the plan on `docs/rearch/51-los-v14-oos-ab-preliminary.md`.
- Finding 1: proposed patchset is acceptable; check relevance of
  `docs/re-notes/ocs-auth-abi-RE.md` because it touches SurfaceFlinger.
- Findings 2/3: identity gate appears to put LOS on the right APS/general
  processing path; remove `libapsfixup` by handling upstream through the p010
  divergence proposal.
- Finding 4: MotionPhoto may have worked in commit
  `725bd5286ac75121b88cd85b8c77c0a495ce95c3` in
  `1vivy/vendor_oplus_camera-sm8850`; verify that the stub matches bring-up
  rules.
- Finding 5: this is not an overexposure issue; continue solid RE and research
  for Depth-2 under `android_frameworks_av`.
- Finding 6: size props should not be present unless set by the Oplus stack;
  investigate source rather than using them as baseline truth.
- v1.4 needed overlay work to launch camera; ensure the source/blobs are synced
  appropriately for v1.5.
- Text/scanner mode is a useful clue: when entering text scanner mode, the
  over-exposed preview disappears. Use this as a concrete EDR/preview-pipeline
  contrast before bring-up implementation.
- Ground v1.5 through the overlay iterative workflow, verification ledger, and
  test-bench campaign tools. Do not conflate OOS baseline capture, LOS campaign
  capture, and bring-up overlay iteration.
- Use `oplus-fwk` as the desired vector for framework additions for now.
- MotionPhoto and the additional preview native handler path are out of scope
  for v1.5. Keep `725bd52` as reference evidence only; do not plan v1.5
  wrapper-on/off implementation or broad APS-preview facilitation.
- Treat `libBasicTonePhoto.so` like `libapsfixup`: an interim in-flight fix is
  acceptable if it works, but it must stay bounded, ledgered, and retired once
  the root framework/upstream post-processing contract is identified.

## Grounded Findings

### v1.4 Matrix

`docs/rearch/51-los-v14-oos-ab-preliminary.md:20` ranks preview EDR/HDR
surface plumbing first, still capture/APS second, P010/BasicTone third,
OCS/media classpath fourth, 8K/OEMLayer fifth, and props sixth.

`docs/rearch/51-los-v14-oos-ab-preliminary.md:22` says OOS returns the preview
BLAST `SurfaceControl` and applies HLG + desired HDR/SDR ratio, while LOS
returns `null` and stays at ratio/dimming 1.0. The same row recommends filling
the OOS EDR chain or choosing a surgical SDR-preview workaround.

`docs/rearch/51-los-v14-oos-ab-preliminary.md:23` says normal still photo is
mostly alive: stream topology, HDR request tags, ADRC/TMC metadata, and fusion
activity are present, and normal photo captures do not show the old UAF/configure
failure.

`docs/rearch/51-los-v14-oos-ab-preliminary.md:24` says P010 allocation and
plane-lock shape now match OOS and the remaining failure is later in
`libBasicTonePhoto.so` at `BasicTone_OGL::saveOutImg()`.

`docs/rearch/51-los-v14-oos-ab-preliminary.md:25` says OOS resolves
`com.oplus.media.OplusHeifWriter`, while LOS resolves
`CameraMetadataNativeWrapper.getMetadataPtr()` but cannot resolve
`OplusHeifWriter` from the OplusCamera classpath.

`docs/rearch/51-los-v14-oos-ab-preliminary.md:27` says live LOS reports
`backCamSize`/`frontCamSize`, but local v1.4 repos and prior `.300` notes do
not justify them, so they should be treated as overlay/resetprop contamination
until the device-side source is found.

`docs/rearch/51-los-v14-oos-ab-preliminary.md:70` orders the patchset as:
preview EDR, then P010/BasicTone, then Oplus media SDK/classpath, then
8K/OEMLayer.

### OCS Auth / SurfaceFlinger

`docs/re-notes/ocs-auth-abi-RE.md:6` frames the ABI as OnePlus Camera SDK
client-auth plus AOSP SurfaceFlinger/framework gaps. It records per-process
`OcsAuthInfo` in SurfaceFlinger and unlocks the OEM EDR composition gate.

`docs/re-notes/ocs-auth-abi-RE.md:28` corrects an older premise: the write side
is Java in `oplus-framework.jar`, not native `libgui.so`; the read side lives in
the SurfaceFlinger main binary.

`docs/re-notes/ocs-auth-abi-RE.md:48` gives the verified chain:
`OplusSurfaceComposerClient.notifyAuthInfo(uid,pid,0x80000000,pkg)` sends
SurfaceFlinger transaction `24001 / 0x5dc1`; SF stores the auth info; later EDR
composition checks that grant.

`docs/re-notes/ocs-auth-abi-RE.md:258` narrows the claim: this is a supported
mechanism for preview EDR mismatch, not a still-photo/no-JPEG root.

`docs/re-notes/ocs-auth-abi-RE.md:283` recommends reimplementing both legs:
framework Java write side and SurfaceFlinger native read side, co-developed with
the EDR read-side port.

Planning conclusion: OCS-auth is directly relevant to the preview EDR/SF lane,
but not to native handle, AHardwareBuffer, or APS buffer identity lanes.

### EDR Conflict To Resolve In Plan

`los-impl/E0-EDR-HARVEST.md:18` observed stock
`OplusEdrUtils.getBlastSurfaceControl(SurfaceView)` returning a real BLAST
surface.

`los-impl/E0-EDR-HARVEST.md:19` observed `setEdrFlags(0x80101)`.

`los-impl/E0-EDR-HARVEST.md:20` observed adaptive `setEdrSdrRatio` values from
about 1.34 to 1.89.

`los-impl/E0-EDR-HARVEST.md:22` observed `setEdrViewTransform` firing zero times
in that preview capture.

`los-impl/E0-EDR-HARVEST.md:60` marks the scalar-ratio conclusion as inference:
strong for preview, but not proven by a LOS fix yet.

Planning conclusion: v1.5 should not blindly implement the older 4x4 curve plan
as the first EDR step. It should first verify the current built stub and scalar
EDR path, include OCS-auth/SF gate relevance, and keep the 4x4
`setEdrViewTransform` ABI as conditional if scalar EDR/OCS evidence fails.

### Text / Scanner Contrast And Campaign Tooling

`tools/observability/TEST-PLAN.md:7` defines the governing rule for this work:
every decisive test is an OOS/LOS A/B with identical stimulus; a single-side run
is triage, not evidence.

`tools/observability/campaign/README.md:7` defines the campaign harness as a
serial, device-locked capture system. Conditions declare mode, AE/AF state,
repeat count, and Frida probes; artifacts land under
`reference/campaign/<condition>/` and are reduced by `parse_condition.py` and
`diff_oos_los.py`.

`tools/observability/campaign/conditions/text.env:1` already covers `MODE=text`
with `AE_LOCK=1` and `REPEAT_N=3`, but it currently has no extra probes.

`tools/observability/campaign/conditions/scandoc.env:1` covers `MODE=scandoc`.
It is not a normal `com.oplus.camera` submode: it launches
`com.coloros.ocrscanner` / `com.oplus.scanner.ui.main.CameraActivity`, so
app-side `com.oplus.camera` probes are intentionally not applicable. The same
condition documents provider/server observations including op mode `0x8001`,
Y8 1440x1080, RAW_OPAQUE streams, and OEM identity transactions.

`tools/observability/campaign/conditions/edr-hdr.env:1` is the current EDR
condition (`MODE=photo`, `AE_LOCK=1`, `EXTRA_PROBES=trace_edr_invocation`).

`tools/observability/campaign/conditions/preview-baseline.env:1` is the current
working-preview denominator with `trace_preview_delivery`,
`probe_getoplushwbuffer`, and `trace_p010_planes`.

`tools/observability/capture/ui/drive_cycle.sh:363` already navigates to TEXT
mode and fires a shutter. `tools/observability/capture/ui/drive_cycle.sh:382`
already enters MORE -> SCAN DOCS and fires a shutter.

Planning conclusion: v1.5 should add a pre-bring-up contrast gate that navigates
normal PHOTO to TEXT and diffs EDR plus preview-delivery state. Use existing
conditions as denominators, but do not rely on the current bare `text.env` alone:
the contrast needs EDR/preview probes and screenshot verification. `scandoc` is
a related but separate-app/server-provider denominator, useful for OEM identity
and op-mode comparison but not equivalent to app-side text mode.

### Current `android_frameworks_av`

`infiniti-camera-port/repos/android_frameworks_av` is present on
`lineage-23.2-cam-final`. Its history includes `a1cb339f5 frameworks/av:
R2 - OnePlus CameraService extension (av/0001)` and current HEAD
`dc44f0462 frameworks/av: SAT-Fusion identity gate - stamp com.oplus.packageName
at configureStreams`.

`infiniti-camera-port/repos/android_frameworks_av/services/camera/libcameraservice/ext/CameraServiceExtFactory.cpp:14`
already `dlopen`s `system_ext/lib64/libcsextimpl.so`.

`infiniti-camera-port/repos/android_frameworks_av/services/camera/libcameraservice/ext/CameraServiceExtFactory.cpp:59`
already resolves the mangled `CameraServiceExtImpl::onTransact` symbol.

`infiniti-camera-port/repos/android_frameworks_av/services/camera/libcameraservice/CameraService.cpp:4136`
already delegates `onTransact` to `CameraServiceExtFactory`.

Planning conclusion: v1.5 should not re-plan av/0001 as absent. It should verify
Depth-1 package/runtime state, then continue into Depth-2 authoring/research.

### P010 / `libapsfixup`

`/home/vivy/oplus-final-p010-divergence/docs/re-notes/p010-los-oos-divergence-candidates.md:10`
says `libapsfixup` is compensating for a plane-descriptor contract break after
QTI mapper already produced a valid contiguous P010 layout.

The same note ranks replacements as:
1. APS descriptor/plane bridge.
2. OOS `CameraServiceExt` / `APSInterface` buffer/result pipeline.
3. Provider/CamX PLANE_LAYOUTS/geometry carrier only if clean A/B shows the
   buffer is born wrong.

`docs/re-notes/libapsfixup-interposition-RE.md:131` says the v1.4 baseline
changes the retirement ranking, and `docs/re-notes/libapsfixup-interposition-RE.md:145`
sets the practical rule: drop `libapsfixup` only after normal photo and
P010/Pro replay both pass without the BasicTone crash.

Planning conclusion: v1.5 can target `libapsfixup` removal, but the executable
plan must sequence it as a no-shim proof gate, not a blind delete. It is still
acceptable to keep a working interim shim while the ideal framework/upstream
implementation is being identified, as Dodge does. The obligation is to
understand the root contract and retire the shim when no-shim P010/Pro replay
passes.

`libBasicTonePhoto.so` should be framed the same way. Local probe and localize
with `tools/frida/probe_basictone.js`; if a bounded BasicTone-side or
post-processing in-flight fix works, v1.5 may incorporate it as an interim
stability fix. The goal remains upstream contract repair and retirement so
post-processing cannot cascade into downstream instability.

### Deferred Reference: MotionPhoto / Metadata Wrapper / `OplusHeifWriter`

The corrected source is `1vivy/vendor_oplus_camera-sm8850`, cloned locally at
`refs/vendor_oplus_camera-sm8850`. Its `lineage-23.2` HEAD is
`af344d39720a3951fe3a957faf21fa3bbbc445e1`.

Commit `725bd5286ac75121b88cd85b8c77c0a495ce95c3` exists there as:
`oplus-camera-stubs: delegate CaptureResult.getNativeMetadata /
CameraMetadataNative.getMetadataPtr (fix motion-photo + SuperEIS NPE)`.

The commit changes only two wrapper files:
- `refs/vendor_oplus_camera-sm8850/oplus-camera-stubs/src/com/oplus/wrapper/hardware/camera2/CaptureResult.java:20`
  reflects `android.hardware.camera2.CaptureResult.mResults` and returns a
  wrapper around the real `android.hardware.camera2.impl.CameraMetadataNative`.
- `refs/vendor_oplus_camera-sm8850/oplus-camera-stubs/src/com/oplus/wrapper/hardware/camera2/impl/CameraMetadataNative.java:20`
  delegates `getMetadataPtr()` to the wrapped hidden AOSP object.

The commit message records the failing path as
`ApsUtils.getMetadataPtrForJni -> CaptureResult.getNativeMetadata ->
getMetadataPtr` on the OCS SDK33+/OplusBuild34+ branch. Pre-commit behavior was
`null`/`0`; post-commit behavior hands SuperEIS/MotionPhoto JNI a real native
camera metadata pointer.

This is not just an inert `OplusHeifWriter` classpath stub. It can plausibly be
an activator for the v18/v19 preview freeze: before it, MotionPhoto/SuperEIS
dies early with NPE/native abort; after it, the Oplus APS preview path can reach
deeper native processing, where missing Depth-2 result/buffer release hooks or
metadata lifecycle mismatches would surface as Gate-B preview delivery
starvation.

The clean current `infiniti-camera-port/repos/android_hardware_oplus/oplus-fwk`
tree has `com.oplus.inner.hardware.camera2.impl.CameraMetadataNativeWrapper`,
but no `com.oplus.wrapper.hardware.camera2.CaptureResult` or
`com.oplus.wrapper.hardware.camera2.impl.CameraMetadataNative` files. Its
`CameraMetadataNativeWrapper` reads field `mMetadataPtr` by reflection, which
may be stale relative to the hidden `getMetadataPtr()` method path used by
`725bd52`.

The old repo also used a different classpath model:
- `refs/vendor_oplus_camera-sm8850/opluscamera.mk:29` ships
  `oplus-camera-stubs` as an off-boot system_ext framework library.
- `refs/vendor_oplus_camera-sm8850/configs/permissions/privapp-permissions-oplus.xml:4`
  makes OCS camera SDK shared libraries depend on `oplus.camera.stubs`.
- `refs/vendor_oplus_camera-sm8850/configs/permissions/privapp-permissions-oplus.xml:18`
  declares `oplus.camera.stubs`.
- `refs/vendor_oplus_camera-sm8850/extract-files.py:179` injects
  `<uses-library android:name="oplus.camera.stubs" ...>` into OplusCamera.

Planning conclusion: this evidence is useful context, but it is explicitly
deferred out of v1.5. The v1.5 plan should not port `725bd52`, should not add a
wrapper-on/wrapper-off MotionPhoto bring-up lane, and should not pursue the
additional preview native handlers as an implementation target. If later
resumed, the deferred lane should first audit source/image classpath parity and
look for explicit OCS/APS fallback signals. For current v1.5 framework
additions, `oplus-fwk` is the preferred vector; do not restore the old off-boot
`oplus-camera-stubs` shared-library model as a v1.5 path.

### v1.4 Launch / Overlay / Blob Sync

`infiniti-camera-port/ITERATION-LOG.md:106` records that v1.4 launched, dismissed
intro, tapped shutter, and saved `/sdcard/DCIM/Camera/IMG20260616125653.jpg`.
It also records runtime overlay use for `oplus-fwk.jar`/boot artifacts and says
app-side OCS logger attach crashes `CameraUnitCallb`, so that logger should stay
off during functional capture.

`infiniti-camera-port/ITERATION-LOG.md:156` records v1.3 re-anchored apsfixup to
`.300` and made the P010 fix active.

`infiniti-camera-port/ITERATION-LOG.md:163` records in-image v1.3 verification:
300 `camera.oemlayer.v2`, 300 `libAlgoProcess`, apsfixup BuildId match, patched
OplusCamera, public libs, heic/livephoto/defercap state.

`infiniti-camera-port/README.md:15` says `repos/` should hold canonical working
clones of all 11 repos; current local discovery found 10 repos, with
`proprietary_vendor_oneplus_infiniti` absent from this local workspace even
though the build flow expects it.

Planning conclusion: v1.5 must include a source-sync preflight: confirm the
v1.4 overlay fix is committed in `android_hardware_oplus`, confirm runtime-only
overlays have source equivalents, confirm the expected blob repo is present on
the build server/sync path, and confirm generated vendor artifacts match the
`.300` dump and the current cam-final refs.

## Scope In

- Produce one v1.5 executable build plan after approval.
- Require pre-bring-up campaign grounding for text/scanner EDR and preview
  pipeline diffs before implementation waves.
- Keep v1.5 source-of-truth on clean `infiniti-camera-port/repos/*` cam-final
  branches and build-server repo sync, not dirty local worktrees.
- Route framework additions through `android_hardware_oplus/oplus-fwk` unless a
  later approved scope change says otherwise.
- Verify Depth-1 `CameraServiceExt` package/runtime state before planning
  Depth-2 implementation.
- Plan Depth-2 `android_frameworks_av` RE/research tasks for
  `beforeConfigureStreamsLocked`, `getExtensionOperatingMode`, `processPreview`,
  `beforeMetadataSendToApp`, result/buffer ownership, and APSInterface probes.
- Plan EDR/SF as preview-specific and OCS-auth-relevant.
- Plan `libapsfixup` and BasicTone interim fixes as bounded stability aids with
  no-shim/root-contract retirement gates.
- Track and reject unexplained `backCamSize`/`frontCamSize` props until their
  source is found.
- Use screenshots/action logs as validation evidence for capture campaigns where
  UI navigation correctness matters.

## Scope Out

- No code implementation in ulw-plan mode.
- No direct write to partitions or `persist.*` props.
- No blind blob swap of `surfaceflinger`.
- No blind deletion of `libapsfixup`.
- No use of dirty `/home/vivy/vendor_oplus_camera` as MotionPhoto source of
  truth; the corrected reference is `refs/vendor_oplus_camera-sm8850`.
- No app-side OCS logger during functional capture until the `CameraUnitCallb`
  crash is isolated.
- No broad APS-preview facilitation implementation in v1.5; collect evidence and
  defer convergence work unless it becomes the smallest necessary fix.
- No MotionPhoto / `725bd52` / additional preview native handler implementation
  in v1.5.
- No restored off-boot `oplus-camera-stubs` shared-library vector for v1.5
  framework additions.
- No treating OOS baseline capture, LOS campaign capture, and overlay bring-up
  as the same operation.
- No treating a BasicTone-side or post-processing in-flight fix as the final
  root fix. It may be incorporated if it works, but it must carry a retirement
  gate and root-cause ledger.

## Recommended Approach Awaiting Approval

Write `.omo/plans/v15-camera-build.md` as a staged v1.5 build plan with these
waves:

1. Pre-bring-up grounding and campaign-method gate.
   - Validate the relevant UI modes and capture correctness before relying on
     traces.
   - Run or define a PHOTO -> TEXT contrast with EDR and preview probes:
     `trace_edr_invocation`, `trace_preview_delivery`, and, if needed,
     `trace_aps_metadata_lifecycle` / `probe_aps_preview_routine`.
   - Compare against `edr-hdr`, `preview-baseline`, and `scandoc` denominators,
     keeping `scandoc` separate as a scanner-app/provider-server case.
   - Capture screenshots/action logs and store campaign evidence under
     `reference/campaign/` plus `.omo/evidence/`.
   - Use overlay iteration only after the campaign diff identifies a concrete
     contract; record each overlay iteration in the ledger.

2. Source sync and v1.4 launch-overlay audit.
   - Confirm all expected repos/refs exist in the clean scaffold and build server
     sync path.
   - Promote any runtime-only v1.4 launch overlay into source or record why it is
     not needed.
   - Verify blob `.300` sync and generated image inputs.

3. EDR/SF preview lane.
   - Reconcile current `OplusEdrUtils` stub state and scalar EDR evidence.
   - Include OCS-auth/SF as directly relevant to the EDR preview contract.
   - Treat the PHOTO -> TEXT over-exposure disappearance as a grounding clue:
     identify whether the mode switch disables EDR, changes preview dataspace,
     changes BLAST/SF metadata, or routes through a different APS preview path.
   - First prove whether scalar flags/ratio + real BLAST + auth gate can fix
     preview; keep 4x4 `setEdrViewTransform` as conditional if scalar proof
     fails or HDR-video/Dolby requires it.

4. P010/BasicTone/no-shim lane.
   - Use p010 Candidate 1 and Candidate 2 as primary replacement directions.
   - Treat `libBasicTonePhoto.so` like `libapsfixup`: a working in-flight fix is
     acceptable as an interim stabilization measure, but it must be documented
     with a root-fix hypothesis and retirement gate.
   - Continue root-contract work in APS/descriptor/GL output paths so neither
     shim nor BasicTone-side fix becomes permanent by inertia.
   - Run no-shim P010/Pro replay as the gate for disabling/removing
     `libapsfixup`.

5. `android_frameworks_av` Depth-2 RE lane.
   - Treat Depth-1 as present in source, but require runtime/package
     verification.
   - Map and author Depth-2 call sites only after the RE tasks identify exact
     bodies and call points.
   - Validate with 8K and P010 probes.
   - Keep proper APS-preview facilitation as a deferred convergence lane unless
     the pre-bring-up diff proves it is the minimal v1.5 unblocker.

6. Prop contamination lane.
   - Locate who sets `backCamSize`/`frontCamSize`; remove from any local overlay
     if present, or record as Oplus runtime mechanism if proven.

7. Build and manual QA.
   - Build v1.5.
   - Drive camera launch, preview, still capture, text/scanner contrast,
     P010/Pro, and 8K through the device capture harness.
   - Store evidence under `.omo/evidence/` and `reference/` according to repo
     rules.

## Test Strategy Default

Recommended default: tests-after plus agent-executed device/manual QA.

Rationale: this is Android framework/vendor bring-up with limited unit seams.
The plan should still use failing-first evidence where possible: pre-change
trace/capture proving the current failure, then post-change trace/capture proving
the target path. OOS baseline capture, LOS campaign capture, and overlay
bring-up are separate operations; baseline/campaign work requires hands-on
screen capture/action-log verification. Static checks, build, Soong/module
verification, `nm`/`strings`, and repo diffs are necessary but not sufficient.

## Remaining Ambiguities And Defaults

1. EDR strategy.
   Recommended default: plan the OOS-shaped preview EDR path with scalar
   flags/ratio plus OCS-auth/SF validation first; only escalate to full 4x4
   libgui/SF ABI if scalar proof fails or a separate HDR-video/Dolby condition
   requires it.

2. `libapsfixup` removal semantics.
   Recommended default: make removal the target, but guard it behind no-shim
   P010/Pro proof. Do not plan a blind delete.

3. MotionPhoto / `725bd52` status.
   Recommended default: use `refs/vendor_oplus_camera-sm8850` as the reference
   source for `725bd52`, not the unrelated dirty checkout, but defer
   MotionPhoto, metadata-wrapper, classpath, and additional preview native
   handler work entirely out of v1.5.

4. Test style.
   Recommended default: tests-after plus device/manual QA, no TDD-first unless a
   stable unit seam is found for a specific Java/C++ framework helper.

5. Text/scanner over-exposure clue.
   Recommended default: make PHOTO -> TEXT a pre-bring-up grounding gate. Treat
   the over-exposure disappearance as evidence of a mode-dependent EDR or
   preview-pipeline change, not as a fix by itself. Compare TEXT separately from
   SCAN DOCS because `scandoc` is a different app and probe lane.

6. BasicTone handling.
   Recommended default: allow a bounded in-flight BasicTone/post-processing fix
   if it works, mirroring Dodge/libapsfixup practice. Require a ledgered root
   hypothesis and retirement gate so the fix does not become a permanent hidden
   post-processing contract break.

## Approval Gate

Awaiting explicit approval to write the executable plan at:

`.omo/plans/v15-camera-build.md`

Approval authorizes only plan generation, not implementation.

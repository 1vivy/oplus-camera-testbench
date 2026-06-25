<!-- STATUS: VERIFIED on-device observation (CPH2747 OnePlus 15, LOS v2.x, 2026-06-25, app pid 18654 front-portrait
     session; SIGQUIT+logcat -b all). A side-finding from the post-capture portrait-selfie freeze hunt: the APS
     result object's METADATA-buffer HW-mem ops are NULL in the app/OCS-SDK consumer process. NOT the freeze cause
     (timing-refuted, see §Discipline). Pairs with aps-pathway-map-RE.md (the IMAGE-plane sibling) + D3 (image handler). -->
# APS metadata-buffer init — `gAPSOps.pfnAPSMemHW{Acquire,Release}` NULL in the OCS-SDK consumer (ApsTotalResult)

## TL;DR
On LOS, the app-side OCS-SDK consumer (`com.oplus.camera`, pid 18654) logs, on the `ApsTotalResult` JNI path, that
the APS ops table's **hardware-memory acquire/release function pointers are NULL**, so the APS *result metadata*
buffer cannot be HW-backed and a tag read fails:

```
E APS_CORE [ALGO_JNI] ...ApsTotalResult.cpp:79  ApsTotalResult_buildMetadataBufferPtr()   gAPSOps.pfnAPSMemHWAcquire is NULL
E APS_CORE [ALGO_JNI] ...ApsTotalResult.cpp:102 ApsTotalResult_destroyMetadataBufferPtr()  gAPSOps.pfnAPSMemHWRelease is NULL
E APS_CORE [ALGO_JNI] ...ApsTotalResult.cpp:118 ApsTotalResult_getMetaValue() ApsTotalResult_getTagValue getMetadata, res: -2
```
JNI class = `com_oplus_ocs_camera_consumer_apsAdapter_adapter_ApsTotalResult`. This is the **metadata-buffer**
counterpart of the image-plane handover already mapped in `aps-pathway-map-RE.md` (where `gAPSOps.pfnAPSBufLckPlanes`
locks IMAGE planes). Here it is the `ApsTotalResult` *result metadata* buffer that wants `pfnAPSMemHWAcquire` /
`pfnAPSMemHWRelease` — and on LOS those slots are NULL.

## Why this is "the Oplus image handler" neighbourhood
`ApsTotalResult` is the APS result object that carries the processed image **and** its metadata back to the app via
the OCS SDK (`...consumer.apsAdapter.adapter`). Its metadata buffer is allocated/freed through the same `gAPSOps`
dispatch table that backs the OEM image handler chain:
- IMAGE side (already documented): `gAPSOps.pfnAPSBufLckPlanes` (`camApsBufferLockPlanes`), `pfnAPSGetHoldImage/Buffers`,
  and the `getOplusHardwareBuffer` / `oplus_aps_exchangeBuffer` return path — see `aps-pathway-map-RE.md` (handover §,
  pathway A2/A5/D1) and `../interop-tree/data/D3-imagereader-hwbuffer.md` (the `getOplusHardwareBuffer` JNI handler).
- METADATA side (this note): `pfnAPSMemHWAcquire` / `pfnAPSMemHWRelease` — the HW-memory acquire/release for the
  result *metadata* buffer, plumbed (when populated) near `aps-pathway-map-RE.md` pathway **A5**
  (`camApsMemHardwareAllocate` → `APSMemTrace::HardwareBuff::allocate`). On LOS these two slots are NULL ⇒
  `build/destroyMetadataBufferPtr` no-op the HW path and `getMetaValue` returns `-2` (tag/metadata unavailable).

So `gAPSOps` is partly populated on LOS (image-plane lock fires) but the **metadata-buffer HW ops are unset** — a
partial ops-table init in the consumer process, not a missing blob (`libAlgoProcess`/`libAPSClient*` are byte-identical
OOS↔LOS per `aps-pathway-map-RE.md`). The unset slots are an environment/registration gap (who fills `gAPSOps` in the
app process), the classic interop-tree facilitation shape.

## Evidence (this session)
- Device CPH2747 (OnePlus 15, SM8850), LOS v2.x, SELinux Permissive, 2026-06-25.
- 12 occurrences clustered at **02:02:26** (threads 18710 / 18734), during a front-camera capture — interleaved
  `buildMetadataBufferPtr`(MemHWAcquire NULL) / `destroyMetadataBufferPtr`(MemHWRelease NULL) / `getMetaValue`(res -2).
- Constant tag-read noise nearby: `VendorTagDescriptor` E (~31760) + `CameraMetadataJV` W (~45175) — the known LOS
  vendor-tag-resolution chatter; the `res: -2` here is the APS-side surfacing of an unavailable metadata tag.

## Discipline — what this is NOT
- **NOT the post-capture portrait-selfie freeze.** The freeze locus is the app GL `onDrawFrame → Thread.sleep`
  retry at **02:03:09**+ (bokeh pipeline quiescent); these APS-NULL errors are at **02:02:26**, a *different* capture
  ~43 s earlier, and do not recur in the freeze window. Timing-refuted as the freeze root (trunk axiom: a line that
  fires on a non-frozen capture is not the freeze root). See the freeze characterization in `../interop-tree/symptoms/S1-preview.md`.
- **OOS divergence UNCONFIRMED.** The OOS golden capture store masks app-side JNI tags
  (`OplusBlurPreviewJNI`/`APS_CORE` absent under the golden's `SENSOR/NCS-excluded` CamX-only frida mask), so we
  cannot yet confirm whether OOS populates `pfnAPSMemHWAcquire/Release` (i.e. whether this is a true LOS regression
  or a benign LOS path with a software-memory fallback). **Open follow-up:** a full-verbose OOS golden (app tags on)
  or a `gAPSOps`-table dump in the app process OOS-vs-LOS.

## Fact-to-resolve
1. Who initialises `gAPSOps` in the **app/OCS-SDK consumer** process, and why are the `MemHW{Acquire,Release}`
   slots NULL there while `pfnAPSBufLckPlanes` is set? (likely a partial registration when the SDK wires the ops table.)
2. Is the NULL path functionally harmless (software-memory fallback for result metadata) or does it degrade
   result-metadata delivery? Correlate with any downstream `getMetaValue == -2` consumers.
3. OOS-vs-LOS: confirm whether OOS sets these slots (needs app-tag-unmasked golden).

## Anchors
- JNI: `com_oplus_ocs_camera_consumer_apsAdapter_adapter_ApsTotalResult.{buildMetadataBufferPtr@:79,
  destroyMetadataBufferPtr@:102, getMetaValue/getTagValue@:118}`
- Ops table: `gAPSOps.pfnAPSMemHWAcquire`, `gAPSOps.pfnAPSMemHWRelease` (NULL on LOS, app process)
- Siblings (populated): `gAPSOps.pfnAPSBufLckPlanes` (`camApsBufferLockPlanes`), `pfnAPSGetHoldImage/Buffers`
- Related docs: `aps-pathway-map-RE.md` (A5 `camApsMemHardwareAllocate`/`APSMemTrace::HardwareBuff`, the handover),
  `../interop-tree/data/D3-imagereader-hwbuffer.md` (image handler), `decmetarefzero-upcall-RE.md` (R1 release upcall),
  `../interop-tree/data/D2-hal-fill-aps.md` (getMetadata/copyMetadata).

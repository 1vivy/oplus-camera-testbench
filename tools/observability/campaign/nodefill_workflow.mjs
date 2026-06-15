export const meta = {
  name: 'oos-tree-nodefill',
  description: 'Fill each interop-tree C/D node (a)-contract from the OOS captures + 1c RE, then author REQUIREMENTS.md',
  phases: [
    { title: 'Extract', detail: 'per-node: grep captures + pair with 1c RE, fill (a)-contract + advance characterization' },
    { title: 'Synthesize', detail: 'REQUIREMENTS.md (relevancy-tagged) + INDEX dashboard + G6 corrections' },
  ],
}

// Each node: which captured conditions + frida logs + 1c re-note it draws on, and the contract question.
// Agents do their OWN targeted greps (logcat is large — never read whole files); they update ONLY the
// node's (a) section + front-matter characterization/conviction, preserving all other sections.
const REPO = '/home/vivy/oplus-final'
const CAP = `${REPO}/reference/campaign`
const NODES = [
  { id: 'C3', file: 'control/C3-cameraserver-extimpl.md',
    conds: ['photo-hdr', 'video8k', 'portrait', 'selfie'],
    renote: 'oem-binder-ontransact-RE.md',
    ask: 'The working configure_streams contract: operation_mode, stream count + per-stream {format,WxH,usage,streamUsecase,hdr_profile}, logicalCameraId/cameraId — photo (3 streams, op_mode 0x8001, RAW10 3280x2464) vs 8K (9 streams, 4096x3072). Pair with the onTransact RE: default-case returns -38 (=live G5 dropped), beforeConfigureStreamsLocked @0x17f71c shapes the 8K StreamSet. State what the OEM Depth-2 hook must reproduce on LOS.' },
  { id: 'C4', file: 'control/C4-hal-provider.md',
    conds: ['photo-hdr', 'edr-hdr'],
    renote: 'aec-hdrdetect-publish-RE.md',
    ask: 'Is hdr_detected published on the daytime HDR scene (probe_aec_hdrdetect.log + logcat)? Pair with the AEC RE: HDRDetectProcess gate @0x1b4d8c (*(ctx+0x48)), HDRTriggerFlagDetection writes aecOut+0xfc. Note this is a #2 publication contract, computes correctly on stock; do NOT call it the #1 freeze root (R-08).' },
  { id: 'C5', file: 'control/C5-camx-chi-feature2.md',
    conds: ['photo-hdr', 'scene', 'beauty'],
    renote: 'aec-hdrdetect-publish-RE.md',
    ask: 'The stock HDR plumbing: GetSHDRAutoExposureUsecase value (captured =0 + SHDRAutoExpNotSupportUsecase), HDRFeature Mode, previewHDR/captureHDR, numHDRExposure (dump_camxsettings.log + logcat). CONFIRM the selectSHDRAutoExposureUsecase knob reads 0 even in the HDR scene → resolve the prior CONFOUNDED with evidence: stock HDR = HDRFeature/DCG path, NOT the auto-exposure usecase (red herring).' },
  { id: 'C6', file: 'control/C6-aps-oemlayer.md',
    conds: ['preview-baseline'],
    renote: 'decmetarefzero-upcall-RE.md',
    ask: 'The working preview result-delivery cadence (the G4 denominator) from preview-baseline logcat — grep the CamX-CORE terms `process_capture_result` / `ProcessCaptureResult` / `ProcessResult` / `requestId` (NOT "OnProcessCaptureResult", which is the framework-layer name and is ABSENT at CamX-core). Compute results/sec over the active capture window (use the line timestamps). Pair with the decMetaRefZero RE: ApsCallbackMetaRefInc::callbackToCamUnit @0x31fa1c, isInc=false=release, Java APSClient$MetaImageRefCounter.decMetaRefZeroToRemove. State the per-frame upcall expectation a working preview shows. Note: the app-side trace_preview_delivery/probe_getoplushwbuffer were not captured this pass (app-side) — mark that as the residual gap.' },
  { id: 'C1', file: 'control/C1-app-ocs-sdk.md', conds: ['photo-hdr', 'preview-baseline'], renote: '',
    ask: 'App/OCS-SDK control intent from logcat (com.oplus.camera + OCS SDK + camera2 calls): mode/HDR intent, getOplusHardwareBuffer usage. Keep light; mark app-side native bits not captured as still-open.' },
  { id: 'C2', file: 'control/C2-fwk-camera2-jni.md', conds: ['photo-hdr', 'preview-baseline'], renote: '',
    ask: 'Framework camera2/JNI relay from logcat (CameraDeviceClient/Camera3-Device/Camera2-JNI): session config relay. Note the getOplusHardwareBuffer JNI bridge is E2-applied (base/0001 effective, #7 refuted); native app-side trace deferred.' },
  { id: 'D1', file: 'data/D1-gralloc-camxformat.md',
    conds: ['p010'],
    renote: '',
    ask: 'The native P010/plane-layout + lock contract from p010/frida/trace_p010_planes.log: plane offsets/strides/sizes from getPlaneLayouts/lockYCbCr, format, contiguity. THIS is the libapsfixup target contract. If the probe did not fire (no plane data), say so explicitly and mark D1 contract STILL-DARK with the reason. Note #5 namespace theory REFUTED → root is lock-math/allocation-input.' },
  { id: 'D2', file: 'data/D2-hal-fill-aps.md', conds: ['burst', 'holdshutter', 'preview-baseline'], renote: 'decmetarefzero-upcall-RE.md',
    ask: 'APS metadata lifetime under back-to-back (burst/holdshutter): any copyMetadata/tombstone (#4) — check ab/*tombstone*, app_backtrace, logcat. On stock should be clean (no UAF). Pair release path with decMetaRefZero RE.' },
  { id: 'D3', file: 'data/D3-imagereader-hwbuffer.md', conds: ['preview-baseline'], renote: 'decmetarefzero-upcall-RE.md',
    ask: 'ImageReader/getOplusHardwareBuffer delivery from logcat. Bridge present+effective (#7 refuted). Native app-side probe_getoplushwbuffer not captured this pass; mark that gap. Release-upcall root deferred to C6.' },
  { id: 'D4', file: 'data/D4-render-sf-edr.md',
    conds: ['edr-hdr'],
    renote: 'edr-sf-readside-RE.md',
    ask: 'The EDR-invocation contract from edr-hdr/app_probes/trace_edr_invocation.log: which libgui setEdr*/OplusEdrUtils calls fire, the SurfaceControl, slot, ratio, the OplusEdrViewTransform.transform[16]. Plus sf_pre/post HDR caps (supportedHdrTypes, ColorMode). Pair with the SF read-side RE (setEdrMetadata @0x40755c 0x5C memcpy, setEDRStatus ratio clamp [1,5]). **CORRECT the stale "G6 DARK/not-hookable" language in this node’s (d) section** — EDR is FRIDA-reachable on stock; only the LOS conviction is deferred. If the app-side probe did not fire, say so and keep G6 contract partial but reclassify reachability.' },
]

phase('Extract')
const SCHEMA = `${REPO}/docs/interop-tree/SCHEMA.md`
const results = await parallel(NODES.map(n => () =>
  agent(
    `You are filling ONE interop-tree node from the OOS stock captures. Node ${n.id}, file ${REPO}/docs/interop-tree/${n.file}.\n` +
    `FIRST read the node file (preserve its structure) and ${SCHEMA} (the two-axis status model: characterization UNCHARACTERIZED→PARTIAL→CHARACTERIZED is the primary axis this phase; conviction stays OPEN/LOS-deferred for runtime nodes).\n` +
    `Capture roots (do TARGETED greps — these logcats are 70k+ lines, NEVER read whole): ${n.conds.map(c => `${CAP}/${c}/{run1,run2,run3}/ab/logcat_all.txt, ${CAP}/${c}/run1/ab/{sf_pre,sf_post,dumpsys_camera_pre,dumpsys_camera_post,meta}.txt, ${CAP}/${c}/frida/*.log, ${CAP}/${c}/app_probes/*.log (APP-side probe fires: EDR, P010, motionphoto), ${CAP}/${c}/verdict.json`).join(' ; ')}.\n` +
    (n.renote ? `Static-RE pair (read it): ${REPO}/docs/re-notes/${n.renote}.\n` : '') +
    `CONTRACT QUESTION: ${n.ask}\n` +
    `Then EDIT the node file SURGICALLY: (1) rewrite section "(a) propagation contract" (or "(a)") to record the OBSERVED working values with exact numbers/tags from the captures (cite the condition); (2) update the YAML front-matter \`characterization:\` to CHARACTERIZED where the contract is now observed end-to-end (else PARTIAL with the precise reason), keep \`conviction:\` as-is unless an E-node oracle changed it, and bump \`updated: 2026-06-14\`; (3) add a one-line G-MECH note pairing the runtime observation with the RE offset where a renote applies. Do NOT touch sections (b)-(f) except the explicit D4 (d) G6 correction. Determinism: only values stable across the runs (verdict.json says ALL STABLE) back a CHARACTERIZED claim; flaky/absent → say so.\n` +
    `Return a 4-6 line summary: the node, the key observed contract values, new characterization status, and any gap (probe-didn’t-fire / app-side-dark).`,
    { label: `fill:${n.id}`, phase: 'Extract' }
  ).then(s => ({ id: n.id, summary: s }))
))

const filled = results.filter(Boolean)
log(`Extract done: ${filled.length}/${NODES.length} nodes updated`)

phase('Synthesize')
const synth = await agent(
  `All interop-tree C/D node (a)-contracts were just refreshed from the OOS stock captures. Now SYNTHESIZE:\n` +
  `1. Author ${REPO}/docs/interop-tree/REQUIREMENTS.md — the distilled "root items that must be set for correct downstream behaviour", DERIVED from the captures + cross-checked against ${REPO}/docs/interop-tree/DIRTY-NOTES-EXAM.md, ${REPO}/docs/interop-tree/REFUTED-LOG.md, and docs/rearch/47. EVERY row carries a CURRENT relevancy tag, do NOT lead with red herrings:\n` +
  `   - LOAD-BEARING: preview-delivery/decMetaRefZeroToRemove release cadence (G4, #1 freeze denominator); OEM binder av/0001 + Depth-2 (onTransact, beforeConfigureStreamsLocked → 8K/#8 & #4); libgui/SF OEM-EDR setEdrViewTransform ABI (#3); 8K configure_streams op_mode 0x8001 + 9-stream/4096x3072 + EISv2 (#8); motion-photo metadata + front-cam stream config.\n` +
  `   - DOWNGRADED/red-herring (tag with refutation): selectSHDRAutoExposureUsecase knob (captured =0 on stock HDR scene — CONFIRMED red herring; real path = HDRFeature/DCG); hdr_detected (a #2 publication contract only, R-08 not the freeze root); getOplusHardwareBuffer (works, #7 refuted); P010-namespace (E4 refuted → D1 lock-math).\n` +
  `   Each row: contract | observed stock value | relevancy tag | owning facilitation node (E2/E3/E4/E1). Cite the condition + RE offset.\n` +
  `2. Update ${REPO}/docs/interop-tree/INDEX.md dashboard: set each C/D node's characterization to its new value, and rewrite the symptom→path map so paths point OUT to docs/facilitation/F* as their roots.\n` +
  `3. CORRECT the stale "G6 DARK/not-frida-hookable" claims in ${REPO}/tools/observability/tables/lever-index.md (frameworks/base + SurfaceFlinger rows) and ${REPO}/tools/observability/tables/logging-gap-register.md (G6 row): reclassify EDR-invocation as FRIDA-reachable on stock (write-side proven via trace_edr_invocation, read-side confirmed in edr-sf-readside-RE.md); only the LOS conviction is deferred; SENSOR/NCS remains the lone true runtime blind spot.\n` +
  `Read the node files + the 4 docs/re-notes/*-RE.md before writing. Be terse and evidence-anchored. Return a summary of REQUIREMENTS rows + the INDEX status line.`,
  { label: 'synthesize', phase: 'Synthesize' }
)

return { nodesFilled: filled.map(f => f.id), synthesis: synth }

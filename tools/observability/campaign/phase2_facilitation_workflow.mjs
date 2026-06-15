export const meta = {
  name: 'phase2-facilitation',
  description: 'Migrate E1–E4 → docs/facilitation/F1–F4, re-scope to optimal-LOS-form, author INDEX/DODGE-ORACLE/BUILD-ORDER',
  phases: [
    { title: 'Migrate+Rescope', detail: 'per F-node: move E→F, re-scope diff→requirements→mechanism→optimal-form (dodge proof-of-form)' },
    { title: 'Synthesize', detail: 'INDEX (req→facilitation board) + DODGE-ORACLE (proof-of-form) + BUILD-ORDER (deps/interlock/upgrade)' },
  ],
}

const REPO = '/home/vivy/oplus-final'
const SRC = `${REPO}/docs/interop-tree/facilitation`
const DST = `${REPO}/docs/facilitation`
const REQ = `${REPO}/docs/interop-tree/REQUIREMENTS.md`
const PPC = `${REPO}/docs/interop-tree/POST-PROCESSING-CONTRACT.md`

const FNODES = [
  { id: 'F1', src: 'E1-stubs.md', dst: 'F1-stubs.md',
    owns: 'R7 (motion-photo CameraMetadataNativeWrapper + front-cam config), R3-partial (OplusEdrUtils stub precondition)',
    dodge: 'dodge android_hardware_oplus/oplus-fwk (BOOT JAR, 142 .java) vs our vendor_oplus_camera/oplus-camera-stubs (system_ext shared lib, 125 .java/189 classes)',
    bake: 'KEEP the system_ext stub model — placement does NOT break resolution (E1 falsified the placement-break hypothesis; <uses-library> is functionally sufficient for the cam app). The OplusEdrUtils no-op stub (getBlastSurfaceControl→null) is NECESSARY-BUT-INSUFFICIENT for #3 — EDR is observed firing on stock (getBlastSurfaceControl→REAL BLAST Surface) so the stub must return real, but the curve fix lives in F2 (native libgui/SF EDR ABI). R7: CameraMetadataNativeWrapper must resolve for the OCS SDK (stock-port shows stable CNFE at APSClient.algoInit when unresolved).' },
  { id: 'F2', src: 'E2-system-framework.md', dst: 'F2-system-framework.md',
    owns: 'R1 (release-upcall bridge = #1 freeze + #4 UAF root fix), R2 (av/0001 onTransact Depth-1), R4 (Depth-2 beforeConfigureStreamsLocked = 8K/#8), R3 (libgui/SF OEM-EDR setEdrViewTransform ABI = #3)',
    dodge: 'dodge patches-crdroid/patch-dodge/frameworks{,av,base,native}/*.patch (sha256-IDENTICAL to ours) — the divergence is APPLY-STATE not file-content',
    bake: 'av/0001 is CONVICTED-NOT-APPLIED = the TOP gap: libcsextimpl absent from the BUILT cameraserver (0 ext call sites) though present in the stock dump (system_ext) → every 100xx binder → UNKNOWN_TRANSACTION -38 (= live G5 dropped). base/0001 IS applied+effective (#7/getOplusHardwareBuffer REFUTED). The 6 Depth-2 hooks (beforeConfigureStreamsLocked=8K StreamSet retype @0x17b71c, getExtensionOperatingMode=op_mode override, processPreview=Gate-B) are missing on BOTH dodge and ours → must be AUTHORED ANEW, not lifted. R1 = the POST-PROCESSING-CONTRACT §(b)/(c) root fix: wire the decMetaRefZeroToRemove release-upcall receiver (Java APSClient$MetaImageRefCounter path) so the per-frame upcall lands → fixes #1 freeze AND #4 UAF (one fix) AND makes the libapsfixup Family-II guard dead code. R3: port the libgui setEdrViewTransform 4x4-curve WRITE ABI + the SF OplusRequestedLayerState READ side (doc-49 + edr-sf-readside-RE) — std-ratio alone is insufficient by construction.' },
  { id: 'F3', src: 'E3-toggles-config.md', dst: 'F3-toggles-config.md',
    owns: 'R5 (hdr_detected / HDR session-state typing), R6 (TurboHDR vendor-tag publish), X1 (SHDR knob — DO NOT author)',
    dodge: 'dodge vendor_oplus_camera/configs + device .prop + overlays — NEITHER side ships a functional camxoverridesettings.txt',
    bake: 'CRITICAL CORRECTION — RETIRE the old E3 recommendation to author camxoverridesettings.txt with selectSHDRAutoExposureUsecase=1. X1 CONFIRMED that knob reads 0 even inside a real HDR scene (red herring); stock HDR rides HDRMode=1 + DCG numHDRExposure 1→2 + offline fusion, NOT the auto-exposure usecase. So R5 optimal-form = ensure the HDR SESSION-STATE / scene-typing that makes the AEC publish hdr_detected (0x80be000b) in-scene (publish SITE = C4; the config that types the session is the lever), NOT the SHDR knob. R6 optimal-form = ensure the OEM IPE TurboHDR vendor-tag (~0x4d78) is published in an HDR scene (its absence → strlen(null) SIGSEGV #6, currently MASKED by libapsfixup Family-III — retire that guard once R6 is fixed). Props/permissions supersets (gallery/HDR/EDR) are intentional E1/HDR plumbing — keep.' },
  { id: 'F4', src: 'E4-sepolicy-namespace.md', dst: 'F4-sepolicy-namespace.md',
    owns: 'X4 (P010 namespace REFUTED), the libapsfixup REDUCTION MAP (POST-PROCESSING-CONTRACT.md)',
    dodge: 'dodge public.libraries.txt (12 libs incl libapsfixup.so; libcamxexternalformatutils ABSENT) — IDENTICAL to ours; sepolicy .te (ours Treble-clean rewrite)',
    bake: 'KEEP the Treble-clean sepolicy + the identical public.libraries patch. P010-namespace theory REFUTED (X4: libcamxexternalformatutils absent both sides yet dodge works; P010 resolves in sphal namespace). **NEW — supersede the old "keep libapsfixup as accepted defense" verdict with the REDUCTION MAP from POST-PROCESSING-CONTRACT.md:** the shim is 6 interposers / 3 families — KEEP irreducible Family-I (P010/chroma geometry, rearch/14 lock-math, no lever); RETIRE Family-II (copyMetadata null-guard — it MASKS #4, does not cause it; root fix = R1 release-upcall in F2) and Family-III (TurboHDR strlen guard — root fix = R6 publish in F3). The shim shrinks to its Family-I core as the contract is satisfied at the root. Note: dodge ALSO ships libapsfixup (so dodge has not done the root fix either — we can do better).' },
]

phase('Migrate+Rescope')
const SCHEMA = `${REPO}/docs/interop-tree/SCHEMA.md`
const migrated = await parallel(FNODES.map(n => () =>
  agent(
    `Phase-2 facilitation: MIGRATE + RE-SCOPE one facilitation node from the diff-era E-plane into the new docs/facilitation/ F-plane.\n` +
    `SOURCE (read fully, preserve its verdicts/evidence): ${SRC}/${n.src}.\n` +
    `Also read: ${REQ} (the REQUIREMENTS rows this node OWNS: ${n.owns}); ${SCHEMA} (status model); ` +
    (n.id === 'F4' || n.id === 'F2' || n.id === 'F3' ? `${PPC} (the post-processing root-fix spec + libapsfixup reduction); ` : '') +
    `and the relevant dodge oracle artifacts under ${REPO}/dodge-camera-port/repos/ (${n.dodge}).\n` +
    `WRITE a NEW file ${DST}/${n.dst} that:\n` +
    `1. Carries forward the source node's front-matter verdict + its evidence (do not lose the CONVICTED/REFUTED/SUPPORTED facts).\n` +
    `2. RE-SCOPES from "dodge-vs-dirty DIFF" to **requirements → mechanism → optimal-LOS-form**: for EACH owned REQUIREMENTS row, state (i) the contract to satisfy, (ii) the optimal LOS mechanism (stub form / framework patch / config artifact / sepolicy-namespace grant), (iii) dodge as **proof-of-form** (does a shipping reference prove this form exists/works? cite the dodge artifact), (iv) the LOS-confines weighting (Treble-clean, re-buildable, system_ext vs boot-jar, author-new vs adopt).\n` +
    `3. Bakes in these DETERMINATIONS (authoritative, from the OOS baseline + RE): ${n.bake}\n` +
    `Keep the two-axis status header. Be terse, evidence-anchored, offset/condition-cited like REQUIREMENTS.md. This is DESIGN/SPEC ONLY — do NOT edit the external LOS tree (~/vendor_oplus_camera, ~/android/lineage); everything stays under ${REPO}.\n` +
    `Return a 5-7 line summary: the node, its owned requirements, the optimal-form verdict per requirement, and the dodge proof-of-form result.`,
    { label: `migrate:${n.id}`, phase: 'Migrate+Rescope' }
  ).then(s => ({ id: n.id, summary: s }))
))

const done = migrated.filter(Boolean)
log(`Migrated ${done.length}/${FNODES.length} F-nodes`)

phase('Synthesize')
const synth = await agent(
  `Phase-2 facilitation SYNTHESIS. The four F-nodes ${DST}/F1-stubs.md, F2-system-framework.md, F3-toggles-config.md, F4-sepolicy-namespace.md were just authored (read them). Now author THREE new docs under ${DST}/ and fix cross-links:\n` +
  `1. ${DST}/INDEX.md — a requirements→facilitation STATUS BOARD: a table mapping each REQUIREMENTS row (R1–R7 + X1–X4 from ${REQ}) → owning F-node → optimal-LOS-form verdict (author-new / port-ABI / keep / retire) → status. Plus a short trunk (the two-phase model: interop-tree = the spec, facilitation = how to enable it on LOS) and a load-bearing-first ordering. Note the F* files ARE the migrated E1–E4 (record the alias).\n` +
  `2. ${DST}/DODGE-ORACLE.md — dodge re-explored "in a different manner": NOT a file diff, but **what dodge PROVES exists/works** (proof-of-form) per facilitation item, mapped to our LOS confines. Where dodge proves a form (e.g. the boot-jar stub, the identical frameworks patches, the public.libraries set, that it SHIPS libapsfixup), state what that proves and whether we adopt or improve on it. Be explicit that dodge ships libapsfixup → it has NOT done the post-processing root fix → our reduction (POST-PROCESSING-CONTRACT.md) is the improvement.\n` +
  `3. ${DST}/BUILD-ORDER.md — the build-time + runtime CONTRACT the E-nodes lacked: (a) build dependency order (e.g. does the F1 stub jar/lib need to land before F2 frameworks patches compile? does F2 av/0001 gate C3?), (b) runtime interlock checks (does F2's CameraService dlopen target match F1's export surface? does the R1 release-upcall receiver match the native callbackToCamUnit signature?), (c) upgrade/re-derive path when dodge or OOS evolves (how to cleanly re-derive F-nodes without fork drift).\n` +
  `4. Update ${REPO}/docs/interop-tree/INDEX.md symptom→path map so the facilitation roots reference docs/facilitation/F* (the migration target); and update ${REPO}/docs/interop-tree/DODGE-VS-DIRTY.md + REFUTED-LOG.md cross-links to note the E→F migration (the E-node files remain as the diff-era source; F-nodes are the forward spec).\n` +
  `Design/spec only, all under ${REPO}. Read F1–F4 + REQUIREMENTS + POST-PROCESSING-CONTRACT before writing. Return a summary of the INDEX status board rows + the key BUILD-ORDER dependencies.`,
  { label: 'synthesize-facilitation', phase: 'Synthesize' }
)

return { fnodes: done.map(f => f.id), synthesis: synth }

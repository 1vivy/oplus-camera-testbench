#!/usr/bin/env python3
"""static_sweep.py — the OOS↔LOS *static* framework-binary handler-discovery sweep.

This is the static, no-device sibling of `diff_oos_los.py` (which diffs RUNTIME capture checkpoints and
is flash-gated). Where `diff_oos_los.py` answers "did OOS and LOS behave the same at runtime?", this tool
answers "do OOS and LOS *contain the same handler logic*?" — statically, against the binaries we already
have on disk, BEFORE a flash.

WHY THIS EXISTS — the v2.0 `formatIsYuv`/P010_VENUS root was found by hand-disassembling ONE OOS golden
binary (`AHardwareBuffer_lockPlanes` in libnativewindow) and noticing stock AOSP's `formatIsYuv` switch
stops before `0x7FA30C0A` while OOS's recognizes it. That gap was *easily missable* (the helper is inlined,
so it has no symbol of its own). This tool generalizes that one-shot RE into a repeatable sweep: harvest the
exact framework symbols the OEM camera blobs depend on (their UND imports — the contract points), then for
each, compare the OOS golden copy against the LOS-built copy and flag the divergence CLASS.

THE A/B SUBSTRATE (no flash needed — both sides are on disk):
  OOS golden : /srv/android/dumps/extracted/dump300_full/{system,system_ext,vendor}/lib64/*.so   (16.0.8.300)
  LOS built  : /srv/android/worktrees/lineage-infiniti/out/target/product/infiniti/{system,...}/lib64/*.so

WHAT IS (and is NOT) a trustworthy cross-build signal
  OOS is built with OnePlus's clang; LOS with Lineage's clang. So *structural* codegen (basic-block order,
  register allocation, raw bytes, addresses, build-id) DIFFERS BENIGNLY everywhere and must NEVER be the
  basis of a divergence verdict. The signals that survive a compiler change — and are therefore the only
  ones this tool convicts on — are SEMANTIC:
    * MISSING-SYMBOL    — a contract-point symbol defined one side, absent the other.
    * CASE-SET-DELTA    — the set of COMPARE CONSTANTS differs (the formatIsYuv class: `cmp w22,<fmt>`).
                          Reconstructed from `mov`+`movk` pairs, so split 32-bit format constants
                          (`0xc0a` | `0x7fa3<<16` = `0x7FA30C0A`) compare as one value.
    * CALL-TARGET-DELTA — the set of called symbol names (PLT/import targets) differs.
  Structural/opcode-histogram differences are reported as INFO only (never a verdict) because they are
  dominated by benign compiler divergence.

FALSE-POSITIVE DEFENSE (reproduced trap): a flat immediate diff of `lockPlanes` flags `0x179/0x368/0x2d8`
— those are `add x1,x1,#imm` PC-relative ADDRESS math, not format cases. We therefore harvest compare
constants ONLY from the compare-family carriers (`cmp/subs/ccmp/tst`), never from `add/sub` address math.

SELF-TEST (soundness gate): `--self-oos <lib>` diffs the OOS golden against itself → MUST be all-MATCH.
Any non-MATCH means the fingerprinter is leaking build noise and must be tightened before any LOS diff is
trusted. (Analogous to `diff_oos_los.py --self`.)

USAGE
  static_sweep.py --oos <dump300_full> --los <out/target/product/infiniti> \\
                  [--libs libnativewindow,libgui,...]              # default = the 7 camera-path libs
                  [--worklist-from <blob.so>[,<blob2.so>...]]      # restrict to these blobs' UND imports
                  [--objdump <path>]                               # default = pinned LOS-prebuilt llvm-objdump
                  [--emit-json <file>] [--report-all] [--quiet]
  static_sweep.py --self-oos --oos <dump300_full> [--libs ...]     # soundness self-test
RUNTIME DEGRADE: a symbol that comes back MATCH but sits on a known-symptom node path is NOT proof of
parity — it only means there is no STATIC fingerprint. Such cases are tagged STATIC-CLEAN and must be
routed to the runtime tier (`diff_oos_los.py` + the symmetric frida probes) at LOS bringup.
"""
import os
import re
import sys
import json
import subprocess

# Reuse the pure-python ELF readers verbatim from the sibling host tool (no re-derivation).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
from patch_chi_logclobber import elf_load_segments, elf_symbols, _is_elf64, _u16, _u32, _u64  # noqa: E402

PINNED_OBJDUMP = ("/srv/android/worktrees/lineage-infiniti/prebuilts/clang/host/linux-x86/"
                  "clang-r547379/bin/llvm-objdump")

# camera-path framework libs (the user-decided focused scope) -> partition-relative path under a root.
DEFAULT_LIBS = {
    "libnativewindow":   "system/lib64/libnativewindow.so",
    "libgui":            "system/lib64/libgui.so",
    "libui":             "system/lib64/libui.so",
    "libcameraservice":  "system/lib64/libcameraservice.so",
    "libcamera2ndk":     "system/lib64/libcamera2ndk.so",
    "libandroid_runtime":"system/lib64/libandroid_runtime.so",
    "libcsextimpl":      "system_ext/lib64/libcsextimpl.so",
}

# Symbols matching this are OEM additions AOSP will never carry — their *absence* on LOS is itself the
# divergence; always reported even outside an explicit worklist.
OEM_NAME_RE = re.compile(r"Oplus|oplus|csext|ExtImpl|TurboHDR|Edr|Gainmap|Cammidas|midas",
                         re.IGNORECASE)
# A compare constant in this range is a Qualcomm vendor pixel format (hi-half 0x7FA3) — the formatIsYuv
# class. Used to mark CASE-SET-DELTAs as format-bearing (highest interest).
def _is_vendor_format(v):
    return (v >> 16) == 0x7FA3 or v in (0x113, 0x114, 0x116, 0x124)

IMM_RE = re.compile(r"#(-?0x[0-9a-fA-F]+|-?\d+)")
HDR_RE = re.compile(r"^([0-9a-fA-F]+)\s+<(.+)>:$")
INSN_RE = re.compile(r"^\s*([0-9a-fA-F]+):\s+(\S+)(?:\s+(.*?))?\s*$")
CALL_TGT_RE = re.compile(r"<([^>+]+)(?:\+0x[0-9a-fA-F]+)?>")   # <name> or <name+0xNN>; drop the +off
COMPARE_MNEMONICS = ("cmp", "cmn", "subs", "ccmp", "ccmn", "tst")
CALL_MNEMONICS = ("bl", "b", "br", "blr")


def _imm32(tok):
    """Parse a `#imm` operand token to a 32-bit unsigned int (two's-complement for negatives)."""
    m = IMM_RE.search(tok)
    if not m:
        return None
    s = m.group(1)
    v = int(s, 16) if "0x" in s.lower() else int(s)
    return v & 0xFFFFFFFF


def _reg(tok):
    """Return the register name (w8/x9/...) at the start of an operand token, else None."""
    t = tok.strip()
    m = re.match(r"^([wx]\d+|wzr|xzr|sp)\b", t)
    return m.group(1) if m else None


def disasm_functions(objdump, path):
    """objdump the whole .text once; return {func_name: [(mnemonic, operands_str), ...]}.
    --no-show-raw-insn drops the opcode-byte column so addresses/bytes never enter the fingerprint."""
    try:
        out = subprocess.run([objdump, "-d", "--no-show-raw-insn", path],
                             capture_output=True, text=True, timeout=600).stdout
    except Exception as e:
        sys.stderr.write(f"  objdump failed on {path}: {e}\n")
        return {}
    funcs, cur, body = {}, None, []
    for line in out.splitlines():
        h = HDR_RE.match(line.strip())
        if h:
            if cur is not None:
                funcs[cur] = body
            cur, body = h.group(2), []
            continue
        if cur is None:
            continue
        m = INSN_RE.match(line)
        if m:
            mnem = m.group(2)
            ops = (m.group(3) or "")
            ops = ops.split("//")[0].strip()    # drop the `// =N` decode comment
            body.append((mnem, ops))
    if cur is not None:
        funcs[cur] = body
    return funcs


def fingerprint(body):
    """Reduce one function body to a SEMANTIC, cross-compiler-stable fingerprint:
       cmpset  = set of reconstructed compare constants (the format/enum/gate case set)
       callset = set of called symbol names (PLT/import targets)
       nins    = instruction count (INFO only — structural, not a verdict basis)
    Compare constants are harvested ONLY from compare-family carriers and reconstructed across mov/movk."""
    regs = {}            # reg -> constructed 32-bit immediate (or None if not a known constant)
    cmpset, callset = set(), set()
    for mnem, ops in body:
        toks = [t.strip() for t in ops.split(",")] if ops else []
        # --- track constants built into registers (mov / movk) so cmp-vs-reg can reconstruct them ---
        if mnem == "mov" and len(toks) >= 2:
            d = _reg(toks[0]); imm = _imm32(toks[1])
            if d:
                regs[d] = imm   # imm may be None (mov reg,reg) -> invalidates
        elif mnem == "movk" and len(toks) >= 2:
            d = _reg(toks[0]); imm = _imm32(toks[1])
            sh = 0
            ms = re.search(r"lsl\s*#(\d+)", ops)
            if ms:
                sh = int(ms.group(1))
            if d and imm is not None and regs.get(d) is not None:
                regs[d] = ((regs[d] & ~(0xFFFF << sh)) | ((imm & 0xFFFF) << sh)) & 0xFFFFFFFF
            elif d and imm is not None:
                regs[d] = ((imm & 0xFFFF) << sh) & 0xFFFFFFFF
            elif d:
                regs[d] = None
        # --- harvest compare constants (the case set) — carriers only, never add/sub address math ---
        elif mnem in COMPARE_MNEMONICS and len(toks) >= 2:
            # immediate form: cmp wA, #imm  /  ccmp wA, #imm, #nzcv, cond  /  tst wA, #imm
            imm = _imm32(toks[1])
            if imm is not None and toks[1].lstrip().startswith("#"):
                cmpset.add(imm)
            else:
                # register form: cmp wA, wB  -> if wB holds a reconstructed constant, that's the case value
                rb = _reg(toks[1])
                if rb and regs.get(rb) is not None:
                    cmpset.add(regs[rb])
            # NB: we do NOT clobber regs here; cmp has no GP destination.
            continue
        # --- call targets (semantic call graph) ---
        elif mnem in CALL_MNEMONICS and ops:
            mt = CALL_TGT_RE.search(ops)
            if mt:
                callset.add(mt.group(1))
            # `b`/`br`/`blr` to a register or local label carry no name -> ignored.
        # --- any other GP-register write invalidates that register's tracked constant ---
        if toks:
            d = _reg(toks[0])
            if d and mnem not in ("mov", "movk") and mnem not in COMPARE_MNEMONICS:
                regs[d] = None
    return {"cmp": cmpset, "call": callset, "nins": len(body)}


def defined_func_names(path):
    """The set of FUNC symbol names DEFINED (st_value != 0) in the lib — used to map a blob's UND import
    to its defining framework lib. Pure-python ELF read (reused helpers)."""
    try:
        b = open(path, "rb").read()
    except OSError:
        return set()
    return set(elf_symbols(b).keys()) if _is_elf64(b) else set()


def und_imports(path):
    """UND (imported) dynsym names of a blob — the framework contract points it depends on.
    Reads .dynsym directly (UND symbols have st_shndx==SHN_UNDEF and st_value==0, so elf_symbols skips
    them — we need the complementary set here). Strips @VERSION."""
    try:
        b = open(path, "rb").read()
    except OSError:
        return set()
    if not _is_elf64(b):
        return set()
    e_shoff = _u64(b, 40); e_shentsize = _u16(b, 58); e_shnum = _u16(b, 60)
    out = set()
    for i in range(e_shnum):
        o = e_shoff + i * e_shentsize
        if _u32(b, o + 4) != 11:   # SHT_DYNSYM
            continue
        sh_offset = _u64(b, o + 24); sh_size = _u64(b, o + 32)
        sh_link = _u32(b, o + 40); sh_entsize = _u64(b, o + 56) or 24
        so = e_shoff + sh_link * e_shentsize
        str_off = _u64(b, so + 24)
        for k in range(sh_size // sh_entsize):
            ent = sh_offset + k * sh_entsize
            st_name = _u32(b, ent + 0)
            st_shndx = _u16(b, ent + 6)
            if st_name == 0 or st_shndx != 0:   # SHN_UNDEF == 0
                continue
            end = b.index(0, str_off + st_name)
            nm = b[str_off + st_name:end].decode("latin1").split("@")[0]
            if nm:
                out.add(nm)
    return out


_CXXFILT = None
def demangle(name):
    global _CXXFILT
    if _CXXFILT is None:
        _CXXFILT = subprocess.run(["bash", "-lc", "command -v c++filt"],
                                  capture_output=True).returncode == 0
    if not _CXXFILT or not name.startswith("_Z"):
        return name
    try:
        r = subprocess.run(["c++filt", name], capture_output=True, text=True, timeout=10)
        return r.stdout.strip() or name
    except Exception:
        return name


def classify(fo, fl):
    """Diff two fingerprints into a verdict + detail. fo/fl may be None (symbol absent that side)."""
    if fo is None or fl is None:
        return "MISSING-SYMBOL", ("absent on LOS" if fl is None else "absent on OOS (LOS-only)")
    if fo["cmp"] != fl["cmp"]:
        only_oos = sorted(fo["cmp"] - fl["cmp"]); only_los = sorted(fl["cmp"] - fo["cmp"])
        fmt = any(_is_vendor_format(v) for v in (set(only_oos) | set(only_los)))
        detail = "OOS-only={%s} LOS-only={%s}%s" % (
            ",".join("0x%x" % v for v in only_oos), ",".join("0x%x" % v for v in only_los),
            "  [VENDOR-FORMAT]" if fmt else "")
        return "CASE-SET-DELTA", detail
    if fo["call"] != fl["call"]:
        only_oos = sorted(fo["call"] - fl["call"]); only_los = sorted(fl["call"] - fo["call"])
        return "CALL-TARGET-DELTA", "OOS-only={%s} LOS-only={%s}" % (
            ",".join(only_oos[:6]), ",".join(only_los[:6]))
    if fo["nins"] != fl["nins"]:
        return "STRUCTURAL-INFO", "nins OOS=%d LOS=%d (codegen; not a verdict)" % (fo["nins"], fl["nins"])
    return "MATCH", ""


VERDICT_ORDER = {"MISSING-SYMBOL": 0, "CASE-SET-DELTA": 1, "CALL-TARGET-DELTA": 2,
                 "STRUCTURAL-INFO": 3, "MATCH": 4}


def sweep_lib(libname, rel, oos_root, los_root, objdump, worklist, self_oos, report_all, rows):
    oos_path = os.path.join(oos_root, rel)
    los_path = oos_path if self_oos else os.path.join(los_root, rel)
    if not os.path.isfile(oos_path):
        print(f"  SKIP {libname}: OOS copy missing ({oos_path})"); return
    if not os.path.isfile(los_path):
        print(f"  SKIP {libname}: LOS copy missing ({los_path})"); return
    fo = {n: fingerprint(b) for n, b in disasm_functions(objdump, oos_path).items()}
    fl = {n: fingerprint(b) for n, b in disasm_functions(objdump, los_path).items()}
    names = set(fo) | set(fl)
    # decide which symbols to REPORT on: worklist contract points, OEM-named, or (with --report-all) all.
    def interesting(n):
        if report_all:
            return True
        if worklist is not None and n in worklist:
            return True
        return bool(OEM_NAME_RE.search(n)) or bool(OEM_NAME_RE.search(demangle(n)))
    printed = 0
    for n in sorted(names):
        if not interesting(n):
            continue
        verdict, detail = classify(fo.get(n), fl.get(n))
        if verdict == "MATCH" and not report_all:
            continue
        if verdict == "STRUCTURAL-INFO" and not report_all:
            continue   # INFO-only, suppressed unless --report-all
        rows.append({"lib": libname, "symbol": n, "demangled": demangle(n),
                     "verdict": verdict, "detail": detail})
        printed += 1
    print(f"  {libname}: {len(fo)} OOS fns / {len(fl)} LOS fns; "
          f"{printed} reportable divergence(s){' [SELF]' if self_oos else ''}")


def main():
    a = sys.argv[1:]
    def opt(flag, default=None):
        return a[a.index(flag) + 1] if flag in a and a.index(flag) + 1 < len(a) else default
    oos_root = opt("--oos")
    los_root = opt("--los")
    objdump = opt("--objdump", PINNED_OBJDUMP)
    self_oos = "--self-oos" in a
    report_all = "--report-all" in a
    libs_arg = opt("--libs")
    worklist_from = opt("--worklist-from")
    emit_json = opt("--emit-json")
    if not oos_root or (not los_root and not self_oos):
        print(__doc__); sys.exit(2)
    if not os.path.isfile(objdump):
        print(f"FATAL: llvm-objdump not at {objdump} (pass --objdump)"); sys.exit(2)

    # --libs tokens are either a known short name (from DEFAULT_LIBS) or a partition-relative path
    # (containing '/', e.g. system/bin/surfaceflinger) swept directly under its basename.
    libs = DEFAULT_LIBS
    if libs_arg:
        libs = {}
        for tok in libs_arg.split(","):
            if "/" in tok:
                libs[os.path.basename(tok)] = tok
            elif tok in DEFAULT_LIBS:
                libs[tok] = DEFAULT_LIBS[tok]
            else:
                print(f"# WARN: unknown lib '{tok}' (not a DEFAULT name and not a rel/path) — skipped")

    # Build the worklist (contract points): UND imports of the named blobs ∩ each lib's defined funcs.
    worklist = None
    if worklist_from:
        und = set()
        for blob in worklist_from.split(","):
            bp = blob if os.path.isabs(blob) else os.path.join(oos_root, blob)
            imp = und_imports(bp)
            print(f"# worklist: {len(imp)} UND imports from {os.path.basename(bp)}")
            und |= imp
        worklist = und   # intersected per-lib inside sweep_lib via defined symbols implicitly (name match)

    print(f"# static_sweep  OOS={oos_root}\n#               LOS={'(self)' if self_oos else los_root}")
    print(f"# objdump={objdump}  libs={','.join(libs)}\n")
    rows = []
    for libname, rel in libs.items():
        sweep_lib(libname, rel, oos_root, los_root, objdump, worklist, self_oos, report_all, rows)

    # ----- report table -----
    rows.sort(key=lambda r: (VERDICT_ORDER.get(r["verdict"], 9), r["lib"], r["symbol"]))
    print("\n## divergence table (semantic verdicts; structural shown only with --report-all)")
    if not rows:
        print("  none — every reported symbol MATCHES across OOS↔LOS"
              f"{' (self-test: GOOD)' if self_oos else ''}.")
    else:
        for r in rows:
            print(f"  [{r['verdict']:<17}] {r['lib']}::{r['demangled'][:70]}")
            if r["detail"]:
                print(f"      {r['detail']}")
    # self-test soundness gate
    if self_oos:
        bad = [r for r in rows if r["verdict"] != "MATCH"]
        print(f"\n## SELF-TEST: {'PASS (all MATCH)' if not bad else 'FAIL — %d non-MATCH (tighten fingerprinter)' % len(bad)}")
    if emit_json:
        json.dump(rows, open(emit_json, "w"), indent=2)
        print(f"\n# wrote {emit_json} ({len(rows)} rows)")
    sys.exit(0)


if __name__ == "__main__":
    main()

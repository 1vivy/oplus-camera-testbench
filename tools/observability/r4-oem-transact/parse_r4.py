#!/usr/bin/env python3
"""r4-oem-transact/parse_r4.py — diff an OOS vs LOS r4 capture into the decision matrix (doc-48 / G5).

Reads two `reference/r4/<tag>` dirs (presence.txt, ext_client_*.log, ext_server_*.log, oem_slice.txt)
and prints, per the README matrix:
  - libcsextimpl present in cameraserver?            (the whole-layer A/B)
  - which OEM transaction codes fired + reply status (Depth-1)
  - which CameraServiceExtImpl hooks fired           (Depth-2, OOS only)
  - 8K op_mode / beforeConfigureStreamsLocked signal (the 8K hypothesis)

Usage: parse_r4.py <oos_dir> <los_dir>
"""
import os, re, sys, glob

TXN = {
 10000:'FIRST_CALL',10001:'ADD_AUTH_RESULT',10002:'SET_DEATH_RECIPIENT',10003:'SET_PACKAGE_NAME',
 10004:'CLIENT_IS_AUTHED',10005:'SET_CLIENT_INFO',10006:'SET_CALL_INFO',10007:'SET_RIO_CLIENT_INFO',
 10008:'SET_TORCH_INTENSITY',10009:'DISCONNECT_CLIENTS',10010:'SET_OMOJI_JSON',10011:'CONNECT_STATUS',
 10012:'OPEN_AON',10013:'CLOSE_AON',10014:'PRE_OPEN_CAMERA',10015:'SEND_OPLUS_EXT_CAM_CMD',
 10016:'SET_IS_CAMERA_UNIT_SESSION',10017:'READ_OPLUS_HAL_MEMORY',10018:'READ_OPLUS_CAMERA_SERVER_MEMORY',
 10019:'REGISTER_CAMERA_DEVICE_CALLBACK',10020:'UNREGISTER_CAMERA_DEVICE_CALLBACK',
 10021:'SET_SATELLITE_CALL_STATE',10022:'SET_DEATH_RECIPIENT_FOR_NAME'}

def slurp(d, pat):
    out = ""
    for f in glob.glob(os.path.join(d, pat)):
        try: out += open(f, errors='ignore').read()
        except OSError: pass
    return out

def present(d):
    p = slurp(d, 'presence.txt') + slurp(d, 'cameraserver_maps.txt')
    if 'libcsextimpl MAPPED' in p or re.search(r'csextimpl', p): return True
    if 'libcsextimpl ABSENT' in p: return False
    return None

def client_codes(d):
    txt = slurp(d, 'ext_client_*.log')
    codes = {}
    for m in re.finditer(r'transact (\d+) \(([^)]+)\)(.*)', txt):
        c = int(m.group(1)); codes.setdefault(c, {'n':0,'false':0})
        codes[c]['n'] += 1
        if 'returned false' in m.group(3) or 'UNKNOWN' in m.group(3): codes[c]['false'] += 1
    return codes

def server_hooks(d):
    txt = slurp(d, 'ext_server_*.log')
    hooks = {}
    for name in ['onTransact','getExtensionOperatingMode','beforeConfigureStreamsLocked',
                 'processPreview','beforeMetadataSendToApp','addRemovePackageName']:
        hooks[name] = len(re.findall(re.escape(name), txt))
    eightk = bool(re.search(r'8K|0x80a9', txt))
    absent = 'ABSENT' in txt
    return hooks, eightk, absent

def main():
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(2)
    oos, los = sys.argv[1], sys.argv[2]
    print("=== r4 OEM-transaction A/B (doc-48 / G5) ===\n")

    po, pl = present(oos), present(los)
    print("[layer] libcsextimpl in cameraserver:  OOS=%s  LOS=%s" % (po, pl))
    if po and pl is False:
        print("        -> CONFIRMS doc-48: the OEM cameraserver layer is absent on LOS.\n")

    co, cl = client_codes(oos), client_codes(los)
    print("[Depth-1] OEM transaction codes fired (client BinderProxy.transact):")
    print("  %-34s %-12s %-12s" % ("code", "OOS (n/false)", "LOS (n/false)"))
    for c in sorted(set(co)|set(cl)):
        o = co.get(c, {'n':0,'false':0}); l = cl.get(c, {'n':0,'false':0})
        tell = "  <- dropped on LOS" if (l['false'] and not o['false']) else ""
        print("  %-34s %-12s %-12s%s" % ("%d %s"%(c,TXN.get(c,'OEM')), "%d/%d"%(o['n'],o['false']),
                                          "%d/%d"%(l['n'],l['false']), tell))

    ho, e8o, _ = server_hooks(oos)
    hl, e8l, absl = server_hooks(los)
    print("\n[Depth-2] CameraServiceExtImpl internal hooks (server, OOS expected / LOS absent):")
    for name in ho:
        print("  %-30s OOS=%-4d LOS=%-4d" % (name, ho[name], hl[name]))
    print("\n[8K] op_mode 0x80a9 / beforeConfigureStreamsLocked seen:  OOS=%s  LOS=%s" % (e8o, e8l))
    if ho.get('beforeConfigureStreamsLocked') and absl:
        print("     -> 8K HYPOTHESIS LIVE: stock invokes beforeConfigureStreamsLocked (StreamSet mutation);")
        print("        LOS has no such hook. Correlate with hook_configure_streams.js EISv2 output stream.")
    print("\nReconcile freeze findings with doc-47 probe_aec_hdrdetect.js before attributing Gate-B here.")

if __name__ == '__main__':
    main()

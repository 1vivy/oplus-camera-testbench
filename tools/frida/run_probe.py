#!/usr/bin/env python3
# Resident frida driver — keeps Interceptor hooks alive for the whole observation window.
# Usage: run_probe.py <pid> <seconds> <agent.js>
import frida, sys, time
pid = int(sys.argv[1]); dur = float(sys.argv[2]); agent = sys.argv[3]
code = open(agent).read()
def on_msg(m, d):
    t = m.get('type')
    if t == 'send':   print('[SEND]', m['payload'], flush=True)
    elif t == 'log':  print(m.get('payload'), flush=True)
    elif t == 'error':print('[ERR]', m.get('stack') or m.get('description'), flush=True)
dev = frida.get_usb_device()
sess = dev.attach(pid)
sc = sess.create_script(code)
sc.on('message', on_msg)
sc.load()
print('[py] attached pid=%d, observing %.1fs' % (pid, dur), flush=True)
time.sleep(dur)
try: sess.detach()
except Exception: pass
print('[py] done', flush=True)

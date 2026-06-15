// FIX VERIFY: force the REAL gate (g_logInfo in libcamxcommonutils.so) wide open
const CCU='libcamxcommonutils.so';
const m=Process.findModuleByName(CCU);
if(!m){console.log('ccu not loaded');}
else{
  const g=m.base.add(0x68010);
  const FULL=ptr('0xFFFFFFFF');
  // all u64 mask slots 0x00..0x70
  for(let o=0x00;o<=0x78;o+=8){ g.add(o).writeU64(uint64('0xFFFFFFFF')); }
  g.add(0x80).writeU32(1);   // enableAsciiLogging -> logcat ON
  // leave +0x84 (binary/offline) as-is; keep storedmark
  // also set updated/stored so nothing re-clobbers via the updated==0 path
  m.base.add(0x687c0).writeU32(1);
  console.log('PATCHED g_logInfo: masks=0xFFFFFFFF, +0x68='+g.add(0x68).readU64().toString(16)+', enableAsciiLogging='+g.add(0x80).readU32());
}

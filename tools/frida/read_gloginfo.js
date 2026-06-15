// Read the live g_logInfo (the REAL log gate) in libcamxcommonutils.so
// g_logInfo (DebugLogInfo, 0x90 bytes) @ file/module +0x68010
const CCU='libcamxcommonutils.so';
function run(){
  const m=Process.findModuleByName(CCU);
  if(!m){console.log('ccu not loaded');return false;}
  const g=m.base.add(0x68010);
  console.log('module base='+m.base+'  g_logInfo='+g);
  const labels={0x00:'mask@00',0x08:'mask@08(logConfig?)',0x10:'mask@10',0x18:'mask@18',0x20:'mask@20',
    0x28:'mask@28',0x30:'mask@30',0x38:'mask@38',0x40:'mask@40',0x48:'mask@48',0x50:'mask@50',
    0x58:'mask@58',0x60:'mask@60',0x68:'mask@68(group0x10000 gate)'};
  for(const off of Object.keys(labels)){
    const o=parseInt(off);
    console.log('  +0x'+o.toString(16)+' = 0x'+g.add(o).readU64().toString(16)+'   '+labels[o]);
  }
  console.log('  +0x80 enableAsciiLogging(u32) = '+g.add(0x80).readU32());
  console.log('  +0x84 flag(u32)               = '+g.add(0x84).readU32());
  console.log('  +0x88 storedmark(u32)         = '+g.add(0x88).readU32());
  // g_logInfoUpdated @ .bss 0x687c0, g_logInfoStored @ 0x687a4
  console.log('  g_logInfoUpdated(0x687c0)='+m.base.add(0x687c0).readU32()+'  g_logInfoStored(0x687a4)='+m.base.add(0x687a4).readU32());
  return true;
}
if(!run()){const t=setInterval(()=>{if(run())clearInterval(t);},500);}

// probe_basictone.js — Family A (doc 28) BasicTone_OGL::saveOutImg SEGV probe.
// Goal: find (1) HOW libAlgoProcess reaches OGLBasicToneProcess (dlsym name + caller lib → the GOT
// vector apsfixup must hook) and (2) the ctx→Image* arg offset + confirm Image->field_0x38.
//
// Run:  frida -U -n com.oplus.camera -l probe_basictone.js   (adb root + frida-server first)
// Then capture in Master/Pro mode (the mode that triggers tombstone_44). Watch the log.
//
// Offsets (libBasicTonePhoto.so, BuildID 012716fe...):
//   OGLBasicToneProcess @ 0x53984   processCore @ 0x53a34   saveOutImg @ 0x543a0
'use strict';

var BT = 'libBasicTonePhoto.so';
var OGL_OFF  = 0x53984;
var SAVE_OFF = 0x543a0;

function hexptr(p) { return p ? p.toString() : 'null'; }

function modOff(addr) {
  var m = Process.findModuleByAddress(addr);
  if (!m) return '??:' + addr;
  return m.name + '+0x' + addr.sub(m.base).toString(16);
}

// ── 1. dlsym vector: which name + caller resolves the BasicTone entry points ────────────────
var dlsym = Module.getGlobalExportByName('dlsym'); // frida-17: static Module.*ExportByName removed -> instance method (doc-50)
if (dlsym) {
  Interceptor.attach(dlsym, {
    onEnter: function (a) { this.name = a[1].isNull() ? null : a[1].readCString(); },
    onLeave: function (ret) {
      if (this.name && /BasicTone|OGLBasic|RefProcess|processImage|getAlgoAPI|algoInitHandle|algoAPI|getParameters|setParameters/i.test(this.name)) {
        console.log('[dlsym] name="' + this.name + '" -> ' + hexptr(ret) +
                    '  caller=' + modOff(this.returnAddress));
      }
    }
  });
  console.log('[probe] dlsym hooked');
}

// ── 2. saveOutImg: x0 = Image* directly → read field_0x38 + the geometry fields ─────────────
function attachBT() {
  var m = Process.findModuleByName(BT);
  if (!m) return false;
  var save = m.base.add(SAVE_OFF);
  var ogl  = m.base.add(OGL_OFF);

  Interceptor.attach(save, {
    onEnter: function (a) {
      var img = a[0];
      var buf = img.add(0x38).readPointer();
      var fmt = img.add(0x1c).readU32();
      var stride = img.add(0x28).readS32();
      var h = img.add(0x2c).readU32();
      console.log('[saveOutImg] Image*=' + hexptr(img) + ' fmt=' + fmt +
                  ' stride=' + stride + ' h=' + h + ' field_0x38=' + hexptr(buf));
      // writability of field_0x38 (the crash predicate apsfixup uses)
      var prot = '??';
      try { var r = Process.findRangeByAddress(buf); prot = r ? r.protection : 'UNMAPPED'; }
      catch (e) {}
      console.log('           field_0x38 prot=' + prot +
                  (prot.indexOf('w') < 0 ? '  <-- NOT WRITABLE (would SEGV)' : ''));
      this.savedImg = img;
    }
  });

  // ── 3. OGLBasicToneProcess: x0 = ctx. Find which ctx offset holds the Image* saveOutImg got.
  Interceptor.attach(ogl, {
    onEnter: function (a) {
      var ctx = a[0];
      console.log('[OGLBasicToneProcess] ctx=' + hexptr(ctx) +
                  ' caller=' + modOff(this.returnAddress));
      // scan ctx[0..0x80] for pointer slots; we'll match against the next saveOutImg Image*
      var slots = [];
      for (var off = 0; off <= 0x80; off += 8) {
        try {
          var p = ctx.add(off).readPointer();
          if (!p.isNull()) slots.push('+0x' + off.toString(16) + '=' + p);
        } catch (e) {}
      }
      console.log('           ctx slots: ' + slots.join('  '));
      // STATICALLY RESOLVED layout (confirm these): *(ctx+0x00)=img1(input), *(ctx+0x08)=img2(output,
      // saveOutImg target/crash), *(ctx+0x10)=BasicTone_OGL this. We expect img2 (ctx+0x08) to equal
      // the next [saveOutImg] Image*.
      try {
        console.log('           ctx+0x00 (img1 in)  -> ' + hexptr(ctx.add(0x00).readPointer()));
        console.log('           ctx+0x08 (img2 out) -> ' + hexptr(ctx.add(0x08).readPointer()) +
                    '  <-- expect == saveOutImg Image*');
        console.log('           ctx+0x10 (this)     -> ' + hexptr(ctx.add(0x10).readPointer()));
      } catch (e) {}
    }
  });

  console.log('[probe] BasicTone hooked @ base=' + m.base);
  return true;
}

if (!attachBT()) {
  // libBasicTonePhoto is dlopen'd at capture time — wait for it.
  var iv = setInterval(function () { if (attachBT()) clearInterval(iv); }, 200);
  console.log('[probe] waiting for ' + BT + ' to load (dlopen at capture)…');
}

// Trace OCS preview delivery chain to localize the freeze.
// Hypothesis: the getOplusHardwareBuffer bridge creates an independent strong-ref
// GraphicBuffer holder that the app never close()s (CloseGuard flood). The preview
// ImageReader pool exhausts after ~maxImages frames -> acquire returns null ->
// APSPreviewManager + GLThread starve -> freeze. The HAL keeps producing.
//
// Attach POST-freeze: if creations are 0/window the delivery STOPPED (exhaustion);
// if creations continue but no render, the freeze is downstream of delivery.
'use strict';

let getOplus = 0, hbClose = 0, imgClose = 0, acqOk = 0, acqNull = 0, onAvail = 0;

function hookJava() {
  Java.perform(function () {
    // --- ImageReader acquire (exhaustion = null returns) ---
    try {
      const IR = Java.use('android.media.ImageReader');
      ['acquireNextImage', 'acquireLatestImage'].forEach(function (m) {
        if (IR[m]) {
          IR[m].overload().implementation = function () {
            const r = this[m]();
            if (r === null) acqNull++; else acqOk++;
            return r;
          };
        }
      });
    } catch (e) { console.log('IR hook err ' + e); }

    // --- Image.close (recycle back to pool) ---
    try {
      const Img = Java.use('android.media.Image');
      Img.close.implementation = function () { imgClose++; return this.close(); };
    } catch (e) { console.log('Image.close err ' + e); }

    // --- HardwareBuffer.close (the free the app supposedly never calls) ---
    try {
      const HB = Java.use('android.hardware.HardwareBuffer');
      HB.close.implementation = function () { hbClose++; return this.close(); };
    } catch (e) { console.log('HB.close err ' + e); }

    // --- the Oplus bridge: find any getOplusHardwareBuffer method on Image/SurfaceImage ---
    ['android.media.ImageReader$SurfaceImage', 'android.media.Image'].forEach(function (cn) {
      try {
        const C = Java.use(cn);
        Object.getOwnPropertyNames(C).forEach(function (mn) {
          if (mn.toLowerCase().indexOf('oplushardwarebuffer') >= 0) {
            try {
              C[mn].overloads.forEach(function (ov) {
                ov.implementation = function () { getOplus++; return ov.apply(this, arguments); };
              });
              console.log('hooked ' + cn + '.' + mn);
            } catch (e2) { console.log('ov err ' + mn + ' ' + e2); }
          }
        });
      } catch (e) {}
    });
    console.log('[*] java hooks installed');
  });
}

// Report every 1s
setInterval(function () {
  console.log(JSON.stringify({
    t: Date.now ? 0 : 0, // placeholder
    getOplus: getOplus, hbClose: hbClose, imgClose: imgClose,
    acqOk: acqOk, acqNull: acqNull, onAvail: onAvail
  }));
  // reset per-window so we see RATE, not cumulative
  getOplus = 0; hbClose = 0; imgClose = 0; acqOk = 0; acqNull = 0; onAvail = 0;
}, 1000);

hookJava();

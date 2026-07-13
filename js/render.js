// Core compositing pipeline. renderToken() is the single source of truth used
// by both the live preview canvas and PNG export, parametrized by pixel size.

// Matrix mapping portrait-local pixel space -> output space at a given output size.
TF.getPortraitMatrix = function (size) {
  const t = TF.state.transform;
  const src = TF.state.sourceCanvas;
  const W = src.width, H = src.height;
  const maxDim = Math.max(W, H);
  const k = (t.scale * size) / maxDim;
  let m = new DOMMatrix();
  m = m.translate(t.cx * size, t.cy * size);
  m = m.rotate(t.rotationDeg);
  m = m.scale(k, k);
  m = m.translate(-W / 2, -H / 2);
  return m;
};

// Uniform scale factor implied by the current transform at a given output size.
TF.getMatrixScale = function (size) {
  const t = TF.state.transform;
  const src = TF.state.sourceCanvas;
  const maxDim = Math.max(src.width, src.height);
  return (t.scale * size) / maxDim;
};

TF.renderToken = async function (ctx, size, opts) {
  opts = opts || {};
  const state = TF.state;
  ctx.clearRect(0, 0, size, size);
  if (!state.sourceLoaded) return;

  const m = TF.getPortraitMatrix(size);
  const ringInfo = await TF.getRingRenderInfo(size);
  const innerRatio = ringInfo.innerRatio;
  const portrait = state.featheredCanvas || state.sourceCanvas;

  // 1. Base portrait, clipped to the ring's inner hole.
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, (size / 2) * innerRatio, 0, Math.PI * 2);
  ctx.clip();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(portrait, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.restore();

  // 2. Ring frame art on top.
  if (ringInfo.image) {
    ctx.drawImage(ringInfo.image, 0, 0, size, size);
  }

  // 3. Pop-out layer: portrait masked by the user-painted mask, drawn
  //    unclipped on top of the ring so marked areas overlap the frame.
  if (state.popoutMaskCanvas) {
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d');
    octx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    octx.drawImage(portrait, 0, 0);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = 'destination-in';
    octx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    octx.drawImage(state.popoutMaskCanvas, 0, 0);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(off, 0, 0);
  }

  // 4. Editing-only overlay: show the pop-out mask as translucent red.
  if (opts.showMaskOverlay && state.popoutMaskCanvas) {
    const off2 = document.createElement('canvas');
    off2.width = size;
    off2.height = size;
    const o2ctx = off2.getContext('2d');
    o2ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    o2ctx.drawImage(state.popoutMaskCanvas, 0, 0);
    o2ctx.setTransform(1, 0, 0, 1, 0, 0);
    o2ctx.globalCompositeOperation = 'source-in';
    o2ctx.fillStyle = '#ff3b3b';
    o2ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.drawImage(off2, 0, 0);
    ctx.restore();
  }
};

TF._previewRAF = null;
TF.requestPreviewRender = function () {
  if (TF._previewRAF) return;
  TF._previewRAF = requestAnimationFrame(async () => {
    TF._previewRAF = null;
    const canvas = document.getElementById('previewCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    await TF.renderToken(ctx, canvas.width, {
      showMaskOverlay: TF.state.showMaskOverlay && TF.isPopoutTool(),
    });
  });
};

TF.exportPNG = async function (size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  await TF.renderToken(ctx, size, { showMaskOverlay: false });
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `token-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve();
    }, 'image/png');
  });
};

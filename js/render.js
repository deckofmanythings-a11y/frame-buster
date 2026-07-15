// Core compositing pipeline. renderToken() is the single source of truth used
// by both the live preview canvas and PNG export, parametrized by pixel size.
//
// `canvasPixelSize` is the full output buffer (token + padding). The token
// itself is a centered square of `canvasPixelSize * TF.getTokenRatio()` px,
// so the ring/portrait/clip stay token-relative regardless of how much
// padding margin surrounds them for pop-out overflow.

// Matrix mapping portrait-local pixel space -> output space.
TF.getPortraitMatrix = function (canvasPixelSize) {
  const t = TF.state.transform;
  const src = TF.state.sourceCanvas;
  const W = src.width, H = src.height;
  const maxDim = Math.max(W, H);
  const tokenDiameter = canvasPixelSize * TF.getTokenRatio();
  const k = (t.scale * tokenDiameter) / maxDim;
  const centerX = canvasPixelSize / 2 + (t.cx - 0.5) * tokenDiameter;
  const centerY = canvasPixelSize / 2 + (t.cy - 0.5) * tokenDiameter;
  let m = new DOMMatrix();
  m = m.translate(centerX, centerY);
  m = m.rotate(t.rotationDeg);
  m = m.scale(k, k);
  m = m.translate(-W / 2, -H / 2);
  return m;
};

// Uniform scale factor implied by the current transform (token-relative).
TF.getMatrixScale = function (canvasPixelSize) {
  const t = TF.state.transform;
  const src = TF.state.sourceCanvas;
  const maxDim = Math.max(src.width, src.height);
  const tokenDiameter = canvasPixelSize * TF.getTokenRatio();
  return (t.scale * tokenDiameter) / maxDim;
};

TF.renderToken = async function (ctx, canvasPixelSize, opts) {
  opts = opts || {};
  const state = TF.state;
  ctx.clearRect(0, 0, canvasPixelSize, canvasPixelSize);
  if (!state.sourceLoaded) return;

  const tokenDiameter = canvasPixelSize * TF.getTokenRatio();
  const tokenOffset = (canvasPixelSize - tokenDiameter) / 2;
  const m = TF.getPortraitMatrix(canvasPixelSize);
  const ringInfo = await TF.getRingRenderInfo(Math.round(tokenDiameter));
  const innerRatio = ringInfo.innerRatio;

  // popoutPortrait is always the background-removed cutout, used for the
  // parts the user paints to bust out past the ring, so those parts don't
  // drag a background-colored patch out past the frame with them.
  const popoutPortrait = state.featheredCanvas || state.sourceCanvas;

  // 1. Base layer, clipped to the ring's inner hole (token-relative, centered).
  //    Optionally, the original art (background intact) draws first as a
  //    lowest layer so removed-background gaps aren't see-through; the
  //    bg-removed cutout always draws on top of it, same clip, same matrix.
  ctx.save();
  ctx.beginPath();
  ctx.arc(canvasPixelSize / 2, canvasPixelSize / 2, (tokenDiameter / 2) * innerRatio, 0, Math.PI * 2);
  ctx.clip();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  if (state.includeOriginalBase) {
    ctx.drawImage(state.originalCanvas, 0, 0);
  }
  ctx.drawImage(popoutPortrait, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.restore();

  // 2. Ring frame art on top, drawn at token size, centered in the canvas.
  if (ringInfo.image) {
    ctx.drawImage(ringInfo.image, tokenOffset, tokenOffset, tokenDiameter, tokenDiameter);
  }

  // 3. Pop-out layer: the bg-removed cutout, masked by the user-painted
  //    mask, drawn unclipped across the *full* canvas (including any
  //    padding margin) on top of the ring.
  if (state.popoutMaskCanvas) {
    const off = document.createElement('canvas');
    off.width = canvasPixelSize;
    off.height = canvasPixelSize;
    const octx = off.getContext('2d');
    octx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    octx.drawImage(popoutPortrait, 0, 0);
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
    off2.width = canvasPixelSize;
    off2.height = canvasPixelSize;
    const o2ctx = off2.getContext('2d');
    o2ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    o2ctx.drawImage(state.popoutMaskCanvas, 0, 0);
    o2ctx.setTransform(1, 0, 0, 1, 0, 0);
    o2ctx.globalCompositeOperation = 'source-in';
    o2ctx.fillStyle = '#ff3b3b';
    o2ctx.fillRect(0, 0, canvasPixelSize, canvasPixelSize);
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

// Exports the current token as FBToken<N>.png, where N is one higher than
// the highest FBToken<N>.png already present. If a save folder has been
// chosen (see save-folder.js) and permission is granted, the file is
// written straight into it and N is computed by scanning its contents;
// otherwise it falls back to a normal download with a per-browser counter.
TF.exportPNG = async function () {
  const size = TF.getExportCanvasSize();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  await TF.renderToken(ctx, size, { showMaskOverlay: false });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

  const folderReady = TF.folderHandle ? await TF.ensureFolderPermission() : false;
  const filename = await TF.getNextTokenFilename(folderReady);

  if (folderReady) {
    try {
      await TF.saveBlobToFolder(blob, filename);
      return { filename, savedToFolder: true };
    } catch (e) {
      // fall through to a normal download below
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { filename, savedToFolder: false };
};

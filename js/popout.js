// "Bust out of frame" mask painting. The mask lives in portrait-local pixel
// space (same dimensions as sourceCanvas) so it stays glued to the art even
// if the portrait is later panned/zoomed/rotated.

TF.paintPopoutAt = function (localX, localY, radius, erase) {
  const mask = TF.state.popoutMaskCanvas;
  const ctx = mask.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';

  const feather = Math.min(0.9, TF.state.brush.feather / 15);
  const hardStop = Math.max(0, 1 - feather);
  const grad = ctx.createRadialGradient(localX, localY, 0, localX, localY, radius);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(hardStop, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(localX, localY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  TF.requestPreviewRender();
};

TF.clearPopoutMask = function () {
  const mask = TF.state.popoutMaskCanvas;
  mask.getContext('2d').clearRect(0, 0, mask.width, mask.height);
  TF.requestPreviewRender();
};

TF.initPopoutTool = function (canvasEl) {
  let painting = false;

  function paintFromEvent(e) {
    const pt = TF.canvasPointFromEvent(canvasEl, e);
    const local = TF.canvasPointToLocal(canvasEl, pt);
    const k = TF.getMatrixScale(canvasEl.width);
    const radius = TF.state.brush.size / k;
    TF.paintPopoutAt(local.x, local.y, radius, TF.state.tool === 'popout-erase');
  }

  canvasEl.addEventListener('pointerdown', (e) => {
    if (!TF.isPopoutTool() || !TF.state.sourceLoaded) return;
    painting = true;
    paintFromEvent(e);
    canvasEl.setPointerCapture(e.pointerId);
  });

  canvasEl.addEventListener('pointermove', (e) => {
    if (!painting || !TF.isPopoutTool()) return;
    paintFromEvent(e);
  });

  window.addEventListener('pointerup', () => { painting = false; });
};

// Portrait pan / zoom / rotate on the preview canvas, plus shared pointer
// coordinate helpers used by the bg-removal brush and popout mask tools.

// Converts a pointer event to internal canvas pixel coordinates (accounts
// for CSS scaling of the canvas element).
TF.canvasPointFromEvent = function (canvasEl, evt) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvasEl.width / rect.width),
    y: (evt.clientY - rect.top) * (canvasEl.height / rect.height),
  };
};

// Converts a canvas-pixel point to portrait-local pixel space using the
// inverse of the current portrait transform matrix.
TF.canvasPointToLocal = function (canvasEl, pt) {
  const m = TF.getPortraitMatrix(canvasEl.width);
  const inv = m.inverse();
  const p = inv.transformPoint(new DOMPoint(pt.x, pt.y));
  return { x: p.x, y: p.y };
};

TF.initTransformTool = function (canvasEl) {
  let dragging = false;
  let last = { x: 0, y: 0 };

  canvasEl.addEventListener('pointerdown', (e) => {
    if (TF.state.tool !== 'transform' || !TF.state.sourceLoaded) return;
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    canvasEl.setPointerCapture(e.pointerId);
  });

  canvasEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    const rect = canvasEl.getBoundingClientRect();
    TF.state.transform.cx += dx / rect.width;
    TF.state.transform.cy += dy / rect.height;
    TF.requestPreviewRender();
  });

  window.addEventListener('pointerup', () => { dragging = false; });

  canvasEl.addEventListener('wheel', (e) => {
    if (TF.state.tool !== 'transform' || !TF.state.sourceLoaded) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const t = TF.state.transform;
    t.scale = Math.min(TF.CONFIG.MAX_SCALE, Math.max(TF.CONFIG.MIN_SCALE, t.scale * factor));
    TF.requestPreviewRender();
  }, { passive: false });
};

TF.setRotation = function (deg) {
  TF.state.transform.rotationDeg = deg;
  TF.requestPreviewRender();
};

TF.resetTransform = function () {
  TF.state.transform = { cx: 0.5, cy: 0.5, scale: 1, rotationDeg: 0 };
  TF.requestPreviewRender();
};

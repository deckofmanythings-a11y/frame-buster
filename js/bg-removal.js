// Background removal: undo history, non-destructive edge feathering,
// magic-wand flood fill, erase/restore brush, and an optional AI auto pass.
//
// TF.state.sourceCanvas is the canonical, sharp-edged, tool-edited canvas.
// TF.state.featheredCanvas is a derived copy (sharp canvas + alpha blur)
// that render.js actually draws, regenerated on demand so the feather
// slider never compounds blur on itself.

TF.MAX_HISTORY = 15;

TF.pushBgHistory = function () {
  const c = TF.state.sourceCanvas;
  const snap = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  TF.state.bgHistory.push(snap);
  if (TF.state.bgHistory.length > TF.MAX_HISTORY) TF.state.bgHistory.shift();
  TF.onHistoryChange && TF.onHistoryChange();
};

TF.undoBg = function () {
  if (TF.state.bgHistory.length <= 1) return;
  TF.state.bgHistory.pop();
  const prev = TF.state.bgHistory[TF.state.bgHistory.length - 1];
  TF.state.sourceCanvas.getContext('2d').putImageData(prev, 0, 0);
  TF.refreshFeatheredCanvas();
  TF.requestPreviewRender();
  TF.onHistoryChange && TF.onHistoryChange();
};

TF.resetBgToOriginal = function () {
  const c = TF.state.sourceCanvas;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(TF.state.originalCanvas, 0, 0);
  TF.finishDestructiveEdit();
};

// --- Non-destructive edge feathering -------------------------------------

TF.featherAlphaInPlace = function (canvas, radius) {
  if (radius <= 0) return;
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h);

  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = w;
  alphaCanvas.height = h;
  const actx = alphaCanvas.getContext('2d');
  const alphaData = actx.createImageData(w, h);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const a = imgData.data[i + 3];
    alphaData.data[i] = a;
    alphaData.data[i + 1] = a;
    alphaData.data[i + 2] = a;
    alphaData.data[i + 3] = 255;
  }
  actx.putImageData(alphaData, 0, 0);

  const blurred = document.createElement('canvas');
  blurred.width = w;
  blurred.height = h;
  const bctx = blurred.getContext('2d');
  bctx.filter = `blur(${radius}px)`;
  bctx.drawImage(alphaCanvas, 0, 0);
  const blurredData = bctx.getImageData(0, 0, w, h);

  for (let i = 0; i < imgData.data.length; i += 4) {
    imgData.data[i + 3] = blurredData.data[i];
  }
  ctx.putImageData(imgData, 0, 0);
};

// Regenerates state.featheredCanvas from the sharp state.sourceCanvas.
// Call after any edit to sourceCanvas, and whenever the feather slider moves.
TF.refreshFeatheredCanvas = function () {
  const src = TF.state.sourceCanvas;
  let out = TF.state.featheredCanvas;
  if (!out || out.width !== src.width || out.height !== src.height) {
    out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    TF.state.featheredCanvas = out;
  }
  const octx = out.getContext('2d');
  octx.clearRect(0, 0, out.width, out.height);
  octx.drawImage(src, 0, 0);
  TF.featherAlphaInPlace(out, TF.state.brush.feather);
  TF.requestPreviewRender();
};

TF.finishDestructiveEdit = function () {
  TF.refreshFeatheredCanvas();
  TF.pushBgHistory();
};

// --- Magic wand -----------------------------------------------------------

TF.magicWandAt = function (localX, localY, tolerance) {
  const c = TF.state.sourceCanvas;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const x0 = Math.floor(localX), y0 = Math.floor(localY);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const idx0 = (y0 * w + x0) * 4;
  if (data[idx0 + 3] === 0) return; // already transparent

  const r0 = data[idx0], g0 = data[idx0 + 1], b0 = data[idx0 + 2];
  const thresh = (tolerance / 100) * 441.7; // max possible RGB distance

  const visited = new Uint8Array(w * h);
  const stack = [x0, y0];
  visited[y0 * w + x0] = 1;

  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    const idx = (y * w + x) * 4;
    const dr = data[idx] - r0, dg = data[idx + 1] - g0, db = data[idx + 2] - b0;
    if (Math.sqrt(dr * dr + dg * dg + db * db) > thresh) continue;
    data[idx + 3] = 0;

    if (x + 1 < w && !visited[y * w + x + 1]) { visited[y * w + x + 1] = 1; stack.push(x + 1, y); }
    if (x - 1 >= 0 && !visited[y * w + x - 1]) { visited[y * w + x - 1] = 1; stack.push(x - 1, y); }
    if (y + 1 < h && !visited[(y + 1) * w + x]) { visited[(y + 1) * w + x] = 1; stack.push(x, y + 1); }
    if (y - 1 >= 0 && !visited[(y - 1) * w + x]) { visited[(y - 1) * w + x] = 1; stack.push(x, y - 1); }
  }

  ctx.putImageData(imgData, 0, 0);
  TF.finishDestructiveEdit();
};

// --- Erase / restore brush -------------------------------------------------
// Called continuously while dragging; refreshFeatheredCanvas() is throttled
// to preview-frame cadence via requestPreviewRender, but the sharp edit and
// history push only happen once the stroke ends (see main.js pointerup).

TF.paintBgBrush = function (localX, localY, radius, restore) {
  const c = TF.state.sourceCanvas;
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.beginPath();
  ctx.arc(localX, localY, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.clearRect(localX - radius, localY - radius, radius * 2, radius * 2);
  if (restore) {
    ctx.drawImage(TF.state.originalCanvas, 0, 0);
  }
  ctx.restore();
  TF.refreshFeatheredCanvas();
};

// --- Automatic AI background removal (progressive enhancement) ------------

TF.autoRemoveBackground = async function (onStatus) {
  onStatus && onStatus('Loading AI model (first run may take a moment)...', false);
  let removeBackground;
  try {
    const mod = await import('https://esm.sh/@imgly/background-removal@1.5.5?bundle');
    removeBackground = mod.removeBackground;
  } catch (e) {
    throw new Error('Could not load AI background removal (offline or blocked by network). Use Magic Wand / Brush tools instead.');
  }

  const c = TF.state.sourceCanvas;
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));

  onStatus && onStatus('Removing background…', false);
  const resultBlob = await removeBackground(blob, { output: { format: 'image/png' } });

  const url = URL.createObjectURL(resultBlob);
  const img = await TF.loadImageEl(url);
  URL.revokeObjectURL(url);

  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  TF.finishDestructiveEdit();
};

// Wires up the UI: ring gallery, tool switching, sliders, upload, export.

TF.initBgToolPointer = function (canvasEl) {
  let painting = false;

  function strokeAt(e, restore) {
    const pt = TF.canvasPointFromEvent(canvasEl, e);
    const local = TF.canvasPointToLocal(canvasEl, pt);
    const k = TF.getMatrixScale(canvasEl.width);
    const radius = TF.state.brush.size / k;
    TF.paintBgBrush(local.x, local.y, radius, restore);
  }

  canvasEl.addEventListener('pointerdown', (e) => {
    if (!TF.state.sourceLoaded) return;
    const tool = TF.state.tool;
    if (tool === 'wand') {
      const pt = TF.canvasPointFromEvent(canvasEl, e);
      const local = TF.canvasPointToLocal(canvasEl, pt);
      TF.magicWandAt(local.x, local.y, TF.state.wand.tolerance);
    } else if (tool === 'erase' || tool === 'restore') {
      painting = true;
      canvasEl.setPointerCapture(e.pointerId);
      strokeAt(e, tool === 'restore');
    }
  });

  canvasEl.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const tool = TF.state.tool;
    if (tool === 'erase' || tool === 'restore') strokeAt(e, tool === 'restore');
  });

  window.addEventListener('pointerup', () => {
    if (painting) {
      painting = false;
      TF.pushBgHistory();
      TF.onHistoryChange && TF.onHistoryChange();
    }
  });
};

TF.onSourceReady = function () {
  document.getElementById('canvasEmptyHint').style.display = 'none';
  [
    'btnAutoRemove', 'toolWand', 'toolErase', 'toolRestore',
    'toolPopoutPaint', 'toolPopoutErase', 'btnClearMask',
    'btnExport', 'btnResetBg',
  ].forEach((id) => { document.getElementById(id).disabled = false; });
};

TF.onHistoryChange = function () {
  const btn = document.getElementById('btnUndo');
  if (btn) btn.disabled = TF.state.bgHistory.length <= 1;
};

document.addEventListener('DOMContentLoaded', () => {
  const previewCanvas = document.getElementById('previewCanvas');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const ringGallery = document.getElementById('ringGallery');
  const ringFileInput = document.getElementById('ringFileInput');

  // --- Pointer-driven tools ------------------------------------------------
  TF.initTransformTool(previewCanvas);
  TF.initPopoutTool(previewCanvas);
  TF.initBgToolPointer(previewCanvas);

  // --- Upload ---------------------------------------------------------------
  async function handleUpload(file) {
    try {
      await TF.loadImageFile(file);
    } catch (err) {
      alert(err.message);
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) await handleUpload(file);
    e.target.value = '';
  });
  ['dragover'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((evt) => dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  }));
  dropzone.addEventListener('drop', async (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) await handleUpload(file);
  });

  // --- Ring gallery -----------------------------------------------------------
  function deselectGallery() {
    ringGallery.querySelectorAll('.ring-swatch').forEach((el) => el.classList.remove('selected'));
  }

  function selectBuiltinRing(id) {
    TF.state.ring = { kind: 'builtin', builtinId: id, customImage: null, innerRatio: TF.state.ring.innerRatio };
    ringGallery.querySelectorAll('.ring-swatch').forEach((el) => {
      el.classList.toggle('selected', el.dataset.ringId === id);
    });
    TF.requestPreviewRender();
  }

  async function buildRingGallery() {
    for (const id of TF.RING_ORDER) {
      const style = TF.RING_STYLES[id];
      const svg = TF.generateRingSVG(id, 96, TF.state.ring.innerRatio);
      const img = await TF.rasterizeSVG(svg, 96);
      const swatch = document.createElement('div');
      swatch.className = 'ring-swatch' + (id === TF.state.ring.builtinId ? ' selected' : '');
      swatch.dataset.ringId = id;
      const label = document.createElement('span');
      label.textContent = style.name;
      swatch.appendChild(img);
      swatch.appendChild(label);
      swatch.addEventListener('click', () => selectBuiltinRing(id));
      ringGallery.appendChild(swatch);
    }
  }
  buildRingGallery();

  ringFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const img = await TF.loadImageEl(url);
      TF.state.ring = {
        kind: 'custom',
        builtinId: TF.state.ring.builtinId,
        customImage: img,
        innerRatio: TF.state.ring.innerRatio,
      };
      deselectGallery();
      TF.requestPreviewRender();
    } catch (err) {
      alert('Could not load that ring image.');
    } finally {
      URL.revokeObjectURL(url);
      e.target.value = '';
    }
  });

  document.getElementById('btnNoRing').addEventListener('click', () => {
    TF.state.ring.kind = 'none';
    deselectGallery();
    TF.requestPreviewRender();
  });

  // --- Tool switching -----------------------------------------------------
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      TF.state.tool = btn.dataset.tool;
      document.querySelectorAll('.tool-btn').forEach((b) => b.classList.toggle('active', b === btn));
      previewCanvas.classList.toggle('painting', btn.dataset.tool !== 'transform');
      TF.requestPreviewRender();
    });
  });

  // --- Sliders --------------------------------------------------------------
  function wireSlider(id, outId, onChange) {
    const el = document.getElementById(id);
    const out = document.getElementById(outId);
    el.addEventListener('input', () => {
      if (out) out.textContent = el.value;
      onChange(parseFloat(el.value));
    });
  }
  wireSlider('tolerance', 'toleranceOut', (v) => { TF.state.wand.tolerance = v; });
  wireSlider('brushSize', 'brushSizeOut', (v) => { TF.state.brush.size = v; });
  wireSlider('feather', 'featherOut', (v) => {
    TF.state.brush.feather = v;
    if (TF.state.sourceLoaded) TF.refreshFeatheredCanvas();
  });
  wireSlider('rotation', 'rotationOut', (v) => TF.setRotation(v));
  wireSlider('innerRatio', 'innerRatioOut', (v) => {
    TF.state.ring.innerRatio = v / 100;
    TF.requestPreviewRender();
  });

  document.getElementById('showMaskOverlay').addEventListener('change', (e) => {
    TF.state.showMaskOverlay = e.target.checked;
    TF.requestPreviewRender();
  });

  // --- Output size (token size + padding) ------------------------------------
  function updateFinalSizeHint() {
    const size = TF.getExportCanvasSize();
    document.getElementById('finalSizeHint').textContent = `Final image: ${size} × ${size}px`;
  }
  document.getElementById('tokenSizeSelect').addEventListener('change', (e) => {
    TF.state.output.tokenSize = parseInt(e.target.value, 10);
    updateFinalSizeHint();
    TF.requestPreviewRender();
  });
  wireSlider('canvasPadding', 'paddingOut', (v) => {
    TF.state.output.canvasPadding = v;
    updateFinalSizeHint();
    TF.requestPreviewRender();
  });
  updateFinalSizeHint();

  // --- Save folder (smart FBToken<N>.png naming) -----------------------------
  const btnChooseFolder = document.getElementById('btnChooseFolder');
  const saveFolderStatus = document.getElementById('saveFolderStatus');

  function describeSaveFolder() {
    if (!TF.supportsFolderPicker) {
      btnChooseFolder.style.display = 'none';
      return "This browser can't scan a folder directly, but downloads still get numbered FBToken1, FBToken2… (counted per-browser).";
    }
    if (TF.folderHandle) {
      return `Saving directly to "${TF.folderHandle.name}" — numbered after the highest FBToken# already there.`;
    }
    return "Not set — downloads go to your browser's default folder, numbered FBToken1, FBToken2… (counted per-browser).";
  }
  saveFolderStatus.textContent = describeSaveFolder();

  btnChooseFolder.addEventListener('click', async () => {
    try {
      await TF.chooseSaveFolder();
      saveFolderStatus.textContent = describeSaveFolder();
    } catch (e) {
      // user cancelled the picker
    }
  });

  TF.restoreSaveFolder().then(() => { saveFolderStatus.textContent = describeSaveFolder(); });

  // --- Buttons ---------------------------------------------------------------
  document.getElementById('btnClearMask').addEventListener('click', () => TF.clearPopoutMask());
  document.getElementById('btnUndo').addEventListener('click', () => TF.undoBg());
  document.getElementById('btnResetBg').addEventListener('click', () => TF.resetBgToOriginal());
  document.getElementById('btnResetTransform').addEventListener('click', () => {
    TF.resetTransform();
    document.getElementById('rotation').value = 0;
    document.getElementById('rotationOut').textContent = '0';
  });

  document.getElementById('btnExport').addEventListener('click', async () => {
    const btn = document.getElementById('btnExport');
    btn.disabled = true;
    try {
      const result = await TF.exportPNG();
      saveFolderStatus.textContent = result.savedToFolder
        ? `Saved ${result.filename} to "${TF.folderHandle.name}".`
        : `Downloaded ${result.filename}.`;
      setTimeout(() => { saveFolderStatus.textContent = describeSaveFolder(); }, 3000);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('btnAutoRemove').addEventListener('click', async () => {
    const btn = document.getElementById('btnAutoRemove');
    const status = document.getElementById('autoRemoveStatus');
    btn.disabled = true;
    status.classList.remove('error');
    status.textContent = 'Starting…';
    try {
      await TF.autoRemoveBackground((msg) => { status.textContent = msg; });
      status.textContent = 'Done!';
      setTimeout(() => { status.textContent = ''; }, 2500);
    } catch (err) {
      status.classList.add('error');
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  TF.requestPreviewRender();
});

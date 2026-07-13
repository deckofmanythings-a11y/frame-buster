// File intake: drag/drop + file input, format validation, source canvas init.

TF.VALID_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
TF.VALID_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

TF.loadImageEl = function (src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

TF.isValidImageFile = function (file) {
  if (TF.VALID_MIME.includes(file.type)) return true;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return TF.VALID_EXTENSIONS.includes(ext);
};

TF.loadImageFile = async function (file) {
  if (!TF.isValidImageFile(file)) {
    throw new Error('Unsupported file type. Please use JPG, PNG, GIF, or WEBP.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await TF.loadImageEl(url);
    TF.initSourceFromImage(img);
  } finally {
    URL.revokeObjectURL(url);
  }
};

TF.initSourceFromImage = function (img) {
  let w = img.naturalWidth, h = img.naturalHeight;
  const maxDim = Math.max(w, h);
  if (maxDim > TF.CONFIG.MAX_SOURCE_DIM) {
    const scale = TF.CONFIG.MAX_SOURCE_DIM / maxDim;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const original = document.createElement('canvas');
  original.width = w;
  original.height = h;
  original.getContext('2d').drawImage(img, 0, 0, w, h);

  const source = document.createElement('canvas');
  source.width = w;
  source.height = h;
  source.getContext('2d').drawImage(img, 0, 0, w, h);

  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;

  TF.state.originalCanvas = original;
  TF.state.sourceCanvas = source;
  TF.state.popoutMaskCanvas = mask;
  TF.state.sourceLoaded = true;
  TF.state.bgHistory = [];
  TF.state.transform = { cx: 0.5, cy: 0.5, scale: 1, rotationDeg: 0 };

  TF.refreshFeatheredCanvas();
  TF.pushBgHistory();

  TF.onSourceReady && TF.onSourceReady();
  TF.requestPreviewRender();
};

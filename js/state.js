// Global namespace + shared state for Frame Buster.
const TF = (window.TF = window.TF || {});

TF.CONFIG = {
  MAX_SOURCE_DIM: 1536,
  PREVIEW_SIZE: 640,
  MIN_SCALE: 0.1,
  MAX_SCALE: 6,
};

TF.state = {
  originalCanvas: null,      // pristine copy of upload, never mutated; always the base/inside-the-ring fill
  sourceCanvas: null,        // working portrait canvas w/ alpha edits, portrait-local space
  featheredCanvas: null,     // derived: sourceCanvas + alpha feather; always the pop-out cutout layer
  sourceLoaded: false,

  bgHistory: [],             // undo stack of ImageData snapshots of sourceCanvas

  transform: { cx: 0.5, cy: 0.5, scale: 1, rotationDeg: 0 },

  ring: {
    kind: 'builtin',         // 'builtin' | 'custom' | 'none'
    builtinId: 'iron',
    customImage: null,
    innerRatio: 0.78,
  },

  // Output canvas can be larger than the token itself, so pop-out art has
  // room to extend past the ring's outer edge. canvasPadding is added
  // symmetrically on all sides, in 64px increments.
  output: {
    tokenSize: 512,
    canvasPadding: 0,
  },

  popoutMaskCanvas: null,    // alpha-only mask, portrait-local space

  tool: 'transform',         // transform | wand | erase | restore | popout-paint | popout-erase
  brush: { size: 40, feather: 2 },
  wand: { tolerance: 30 },
  showMaskOverlay: true,
};

TF.getTokenRatio = function () {
  const o = TF.state.output;
  const total = o.tokenSize + o.canvasPadding * 2;
  return o.tokenSize / total;
};

TF.getExportCanvasSize = function () {
  const o = TF.state.output;
  return o.tokenSize + o.canvasPadding * 2;
};

TF.isPopoutTool = function () {
  return TF.state.tool === 'popout-paint' || TF.state.tool === 'popout-erase';
};

TF.isBgBrushTool = function () {
  return TF.state.tool === 'erase' || TF.state.tool === 'restore';
};

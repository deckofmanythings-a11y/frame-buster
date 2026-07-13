// Global namespace + shared state for Token Forge.
const TF = (window.TF = window.TF || {});

TF.CONFIG = {
  MAX_SOURCE_DIM: 1536,
  PREVIEW_SIZE: 640,
  MIN_SCALE: 0.1,
  MAX_SCALE: 6,
};

TF.state = {
  originalCanvas: null,      // pristine copy of upload, never mutated (restore-brush source)
  sourceCanvas: null,        // working portrait canvas w/ alpha edits, portrait-local space
  sourceAlphaBaseline: null, // ImageData snapshot used as feather baseline
  sourceLoaded: false,

  bgHistory: [],             // undo stack of ImageData snapshots of sourceCanvas

  transform: { cx: 0.5, cy: 0.5, scale: 1, rotationDeg: 0 },

  ring: {
    kind: 'builtin',         // 'builtin' | 'custom' | 'none'
    builtinId: 'iron',
    customImage: null,
    innerRatio: 0.78,
  },

  popoutMaskCanvas: null,    // alpha-only mask, portrait-local space

  tool: 'transform',         // transform | wand | erase | restore | popout-paint | popout-erase
  brush: { size: 40, feather: 2 },
  wand: { tolerance: 30 },
  showMaskOverlay: true,
};

TF.isPopoutTool = function () {
  return TF.state.tool === 'popout-paint' || TF.state.tool === 'popout-erase';
};

TF.isBgBrushTool = function () {
  return TF.state.tool === 'erase' || TF.state.tool === 'restore';
};

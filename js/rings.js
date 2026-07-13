// Built-in token ring styles, generated as parametric SVG so they stay crisp at any export size.

TF.RING_STYLES = {
  iron: { name: 'Iron', base: ['#5a5e66', '#1b1c20'], accent: '#a7acb6', gem: null, ticks: 24, tickStyle: 'notch' },
  bronze: { name: 'Bronze', base: ['#c9863f', '#5c3317'], accent: '#e7b876', gem: '#2c2013', ticks: 16, tickStyle: 'diamond' },
  silver: { name: 'Silver Ornate', base: ['#e6eaef', '#8790a0'], accent: '#ffffff', gem: '#3aa0ff', ticks: 20, tickStyle: 'leaf' },
  gold: { name: 'Gold Royal', base: ['#fbe28f', '#a8791a'], accent: '#fff3c4', gem: '#b3123b', ticks: 8, tickStyle: 'gem' },
  crimson: { name: 'Blood Crimson', base: ['#9c1c28', '#1c0407'], accent: '#e07d7d', gem: '#0b0b0b', ticks: 16, tickStyle: 'notch' },
  nature: { name: 'Nature Vine', base: ['#5f8542', '#233016'], accent: '#a8cf78', gem: '#6b4423', ticks: 12, tickStyle: 'leaf' },
  arcane: { name: 'Arcane', base: ['#5539a8', '#150e2e'], accent: '#b79dff', gem: '#28e0e0', ticks: 8, tickStyle: 'rune' },
  simple: { name: 'Simple Thin', base: ['#eeeeee', '#8a8a8a'], accent: '#ffffff', gem: null, ticks: 0, tickStyle: 'none', thin: true },
};

TF.RING_ORDER = ['iron', 'bronze', 'silver', 'gold', 'crimson', 'nature', 'arcane', 'simple'];

// Builds an SVG string for a ring style at a given pixel size, with a hole
// cut at innerRatio (0-1, fraction of outer radius).
TF.generateRingSVG = function (styleId, size, innerRatio) {
  const style = TF.RING_STYLES[styleId];
  const cx = 250, cy = 250;
  const outerR = 245;
  const innerR = outerR * innerRatio;
  const gradId = 'g_' + styleId;
  const maskId = 'hole_' + styleId;
  const tickR = (outerR + innerR) / 2;
  const n = style.ticks;

  let ticks = '';
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const x = cx + Math.cos(ang) * tickR;
    const y = cy + Math.sin(ang) * tickR;
    const rotDeg = (ang * 180) / Math.PI + 90;
    if (style.tickStyle === 'notch') {
      ticks += `<rect x="${x - 3}" y="${y - 8}" width="6" height="16" rx="2" fill="${style.accent}" opacity="0.55" transform="rotate(${rotDeg} ${x} ${y})"/>`;
    } else if (style.tickStyle === 'diamond') {
      ticks += `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="${style.accent}" opacity="0.6" transform="rotate(45 ${x} ${y})"/>`;
    } else if (style.tickStyle === 'leaf') {
      ticks += `<ellipse cx="${x}" cy="${y}" rx="4" ry="10" fill="${style.accent}" opacity="0.5" transform="rotate(${rotDeg} ${x} ${y})"/>`;
    } else if (style.tickStyle === 'gem') {
      ticks += `<circle cx="${x}" cy="${y}" r="9" fill="${style.gem}" stroke="${style.accent}" stroke-width="2"/>`;
    } else if (style.tickStyle === 'rune') {
      ticks += `<rect x="${x - 2}" y="${y - 9}" width="4" height="18" fill="${style.accent}" opacity="0.7" transform="rotate(${rotDeg} ${x} ${y})"/>`;
    }
  }

  let gems = '';
  if (style.gem && style.tickStyle !== 'gem') {
    [0, 90, 180, 270].forEach((deg) => {
      const ang = (deg * Math.PI) / 180;
      const x = cx + Math.cos(ang) * tickR;
      const y = cy + Math.sin(ang) * tickR;
      gems += `<circle cx="${x}" cy="${y}" r="12" fill="${style.gem}" stroke="${style.accent}" stroke-width="2.5"/>
                <circle cx="${x - 3}" cy="${y - 3}" r="3" fill="#ffffff" opacity="0.6"/>`;
    });
  }

  const strokeW = style.thin ? 4 : 3;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 500 500">
    <defs>
      <radialGradient id="${gradId}" cx="50%" cy="45%" r="65%">
        <stop offset="0%" stop-color="${style.base[0]}"/>
        <stop offset="100%" stop-color="${style.base[1]}"/>
      </radialGradient>
      <mask id="${maskId}">
        <rect x="0" y="0" width="500" height="500" fill="#ffffff"/>
        <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#000000"/>
      </mask>
    </defs>
    <g mask="url(#${maskId})">
      <circle cx="${cx}" cy="${cy}" r="${outerR}" fill="url(#${gradId})"/>
      ${ticks}
      ${gems}
      <circle cx="${cx}" cy="${cy}" r="${outerR - 2}" fill="none" stroke="${style.accent}" stroke-width="${strokeW}" opacity="0.55"/>
      <circle cx="${cx}" cy="${cy}" r="${innerR + 2}" fill="none" stroke="#000000" stroke-width="${strokeW}" opacity="0.45"/>
    </g>
  </svg>`;
};

// Rasterizes an SVG string into an <img> Element usable with drawImage.
TF.rasterizeSVG = function (svgString, size) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
};

TF._ringCache = {};

// Returns { image, innerRatio } for the currently selected ring, rasterized at `size`.
TF.getRingRenderInfo = async function (size) {
  const ring = TF.state.ring;
  const innerRatio = ring.innerRatio;
  if (ring.kind === 'none') return { image: null, innerRatio };
  if (ring.kind === 'custom' && ring.customImage) {
    return { image: ring.customImage, innerRatio };
  }
  const key = ring.builtinId + '_' + size + '_' + innerRatio.toFixed(3);
  if (TF._ringCache[key]) return { image: TF._ringCache[key], innerRatio };
  const svg = TF.generateRingSVG(ring.builtinId, size, innerRatio);
  const img = await TF.rasterizeSVG(svg, size);
  TF._ringCache[key] = img;
  return { image: img, innerRatio };
};

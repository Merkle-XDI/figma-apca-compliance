const test = require('node:test');
const assert = require('node:assert');

// --- Reference APCA Implementation from SKILL.md ---

function sRGBtoY(rgb) {
  // rgb is an array [R, G, B] with values 0–255
  function linearize(val) {
    val /= 255;
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  }
  return 0.2126729 * linearize(rgb[0]) +
         0.7151522 * linearize(rgb[1]) +
         0.0721750 * linearize(rgb[2]);
}

function APCAcontrast(textRGB, bgRGB) {
  const SA98G = {
    mainTRC: 2.4,
    Ntex: 0.57, Nbg: 0.56,
    Rtex: 0.62, Rbg: 0.65,
    W_scale: 1.14,
    W_offset: 0.027,
    Lo_clip: 0.1,
    delta_Y_min: 0.0005,
    Blk_thr: 0.022, Blk_clmp: 1.414,
  };

  let Ytxt = sRGBtoY(textRGB);
  let Ybg  = sRGBtoY(bgRGB);

  // Black clamp
  Ytxt = Ytxt > SA98G.Blk_thr ? Ytxt : Ytxt + Math.pow(SA98G.Blk_thr - Ytxt, SA98G.Blk_clmp);
  Ybg  = Ybg  > SA98G.Blk_thr ? Ybg  : Ybg  + Math.pow(SA98G.Blk_thr - Ybg,  SA98G.Blk_clmp);

  let Lc = 0;
  if (Math.abs(Ybg - Ytxt) < SA98G.delta_Y_min) return 0;

  if (Ybg > Ytxt) {
    // Normal polarity (dark text on light BG)
    Lc = (Math.pow(Ybg, SA98G.Nbg) - Math.pow(Ytxt, SA98G.Ntex)) * SA98G.W_scale;
    Lc = Lc < SA98G.Lo_clip ? 0 : Lc - SA98G.W_offset;
  } else {
    // Reverse polarity (light text on dark BG)
    Lc = (Math.pow(Ybg, SA98G.Rbg) - Math.pow(Ytxt, SA98G.Rtex)) * SA98G.W_scale;
    Lc = Lc > -SA98G.Lo_clip ? 0 : Lc + SA98G.W_offset;
  }

  return Math.round(Lc * 100); // Returns signed Lc value
}

function hexToRGB(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
  return [
    parseInt(hex.substring(0,2), 16),
    parseInt(hex.substring(2,4), 16),
    parseInt(hex.substring(4,6), 16)
  ];
}

// --- HSL & Conversion Utilities ---

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), s, l];
}

function rgbToHue(rgb) {
  return rgbToHsl(rgb[0], rgb[1], rgb[2])[0];
}

function rgbToSat(rgb) {
  return rgbToHsl(rgb[0], rgb[1], rgb[2])[1];
}

function rgbToLightness(rgb) {
  return rgbToHsl(rgb[0], rgb[1], rgb[2])[2];
}

function hslToRGB(h, s, l) {
  h /= 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(rgb) {
  return '#' + rgb.map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// --- Remapping Algorithms from SKILL.md ---

function findCompliantTextColor(bgHex, targetLc, isDarkMode, seedHex = null) {
  const bgRGB = hexToRGB(bgHex);
  const seed = seedHex ? hexToRGB(seedHex) : null;

  // Try adjusting lightness of text color until Lc target is met
  // Step through HSL lightness in 1% increments
  for (let L = isDarkMode ? 95 : 5; isDarkMode ? L >= 5 : L <= 95; isDarkMode ? L-- : L++) {
    const candidateRGB = hslToRGB(seed ? rgbToHue(seed) : 0, seed ? rgbToSat(seed) : 0, L / 100);
    const lc = Math.abs(APCAcontrast(candidateRGB, bgRGB));
    if (lc >= Math.abs(targetLc)) {
      return rgbToHex(candidateRGB);
    }
  }
  return null; // No compliant color found at this hue/saturation
}

function findCompliantBgColor(textHex, targetLc, isDarkMode, seedHex = null) {
  const textRGB = hexToRGB(textHex);
  const seed = seedHex ? hexToRGB(seedHex) : null;

  const start = isDarkMode ? 40 : 60;
  const end   = isDarkMode ? 0  : 100;
  const step  = isDarkMode ? -1 : 1;

  for (let L = start; isDarkMode ? L >= end : L <= end; L += step) {
    const hue = seed ? rgbToHue(seed) : 0;
    const sat = seed ? rgbToSat(seed) : 0;
    const candidateRGB = hslToRGB(hue, sat, L / 100);
    const lc = Math.abs(APCAcontrast(textRGB, candidateRGB));
    if (lc >= Math.abs(targetLc)) {
      return rgbToHex(candidateRGB);
    }
  }
  return null;
}

// --- Edge Case Detectors from SKILL.md ---

function isMidLuminanceTrap(bgHex, targetLc) {
  const bgRGB = hexToRGB(bgHex);
  const maxWithBlack = Math.abs(APCAcontrast([0, 0, 0],     bgRGB));
  const maxWithWhite = Math.abs(APCAcontrast([255, 255, 255], bgRGB));
  return Math.max(maxWithBlack, maxWithWhite) < targetLc;
}

function isHalation(textHex, bgHex) {
  const lc = APCAcontrast(hexToRGB(textHex), hexToRGB(bgHex));
  return lc < -90; // Negative = dark mode; more negative than -90 = halation
}

function findHalationSafeBg(textHex, seedBgHex) {
  const textRGB = hexToRGB(textHex);
  const seed    = hexToRGB(seedBgHex);

  for (let L = rgbToLightness(seed) * 100; L <= 35; L += 0.5) {
    const candidateRGB = hslToRGB(rgbToHue(seed), rgbToSat(seed), L / 100);
    const lc = APCAcontrast(textRGB, candidateRGB);
    if (Math.abs(lc) <= 90) {
      return rgbToHex(candidateRGB);
    }
  }
  return null;
}

// --- Test Suites ---

test('hexToRGB parsing', () => {
  assert.deepStrictEqual(hexToRGB('#000000'), [0, 0, 0]);
  assert.deepStrictEqual(hexToRGB('#ffffff'), [255, 255, 255]);
  assert.deepStrictEqual(hexToRGB('FFF'), [255, 255, 255]);
  assert.deepStrictEqual(hexToRGB('#1e3a5f'), [30, 58, 95]);
});

test('APCA Contrast - White and Black extremes', () => {
  const black = [0, 0, 0];
  const white = [255, 255, 255];
  
  const blackOnWhite = APCAcontrast(black, white);
  const whiteOnBlack = APCAcontrast(white, black);
  
  // Black on white is normal polarity (~106)
  assert.ok(blackOnWhite > 100 && blackOnWhite <= 108);
  // White on black is reverse polarity (~-107)
  assert.ok(whiteOnBlack < -100 && whiteOnBlack >= -109);
});

test('Mid-Luminance Surface Trap detection', () => {
  // A mid-tone green like #14ae5c has a luminance that cannot reach Lc 75 with black or white text
  assert.strictEqual(isMidLuminanceTrap('#14ae5c', 75), true);
  
  // Neutral white is definitely not a trap for Lc 75 (black text easily passes)
  assert.strictEqual(isMidLuminanceTrap('#ffffff', 75), false);
});

test('Halation detection and resolution', () => {
  // Pure white text on #1e1e1e causes halation (Lc < -90)
  assert.strictEqual(isHalation('#ffffff', '#1e1e1e'), true);
  
  // Find a safe background
  const safeBg = findHalationSafeBg('#ffffff', '#1e1e1e');
  assert.ok(safeBg);
  assert.strictEqual(isHalation('#ffffff', safeBg), false);
});

test('findCompliantTextColor solves compliance', () => {
  const bg = '#ffffff'; // White background (light mode)
  const seedText = '#666699'; // Some gray-blue
  
  // Get compliant color for Lc 60
  const compliantText = findCompliantTextColor(bg, 60, false, seedText);
  assert.ok(compliantText);
  
  const finalContrast = Math.abs(APCAcontrast(hexToRGB(compliantText), hexToRGB(bg)));
  assert.ok(finalContrast >= 60);
});

test('findCompliantBgColor solves compliance when text is brand-locked', () => {
  const lockedText = '#ffffff'; // Locked white text (dark mode context)
  const seedBg = '#14ae5c'; // Mid-luminance green background (causes trap at Lc 60/75)
  
  const compliantBg = findCompliantBgColor(lockedText, 60, true, seedBg);
  assert.ok(compliantBg);
  
  const finalContrast = Math.abs(APCAcontrast(hexToRGB(lockedText), hexToRGB(compliantBg)));
  assert.ok(finalContrast >= 60);
});

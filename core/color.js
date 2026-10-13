// Colour maths: palette extraction, tints/shades, WCAG contrast, CMYK. Pure functions.
'use strict';

function hexToRgb(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('').toUpperCase();

function rgbToCmyk({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - rr - k) / (1 - k)) * 100),
    m: Math.round(((1 - gg - k) / (1 - k)) * 100),
    y: Math.round(((1 - bb - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

function rgbToHsl({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
    else if (max === gg) h = ((bb - rr) / d + 2) * 60;
    else h = ((rr - gg) / d + 4) * 60;
  }
  return { h, s, l };
}

const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

// Tints mix toward white, shades toward black, at 20/40/60/80 %.
function tintsAndShades(hex, steps = [0.2, 0.4, 0.6, 0.8]) {
  const rgb = hexToRgb(hex);
  return {
    tints: steps.map((t) => ({ amount: Math.round(t * 100), hex: rgbToHex(mix(rgb, WHITE, t)) })),
    shades: steps.map((t) => ({ amount: Math.round(t * 100), hex: rgbToHex(mix(rgb, BLACK, t)) })),
  };
}

function luminance({ r, g, b }) {
  const ch = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrastRatio(hexA, hexB) {
  const la = luminance(hexToRgb(hexA)), lb = luminance(hexToRgb(hexB));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

// WCAG 2.x levels for normal text (large text needs only 3:1 for AA).
function wcag(ratio) {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA Large';
  return 'Fail';
}

function describe(hex) {
  const rgb = hexToRgb(hex);
  const onWhite = contrastRatio(hex, '#FFFFFF');
  const onBlack = contrastRatio(hex, '#000000');
  return {
    hex: rgbToHex(rgb),
    rgb,
    cmyk: rgbToCmyk(rgb),
    contrast: {
      white: { ratio: onWhite, rating: wcag(onWhite) },
      black: { ratio: onBlack, rating: wcag(onBlack) },
    },
    bestText: onWhite >= onBlack ? '#FFFFFF' : '#000000',
    ...tintsAndShades(hex),
  };
}

// Full report for a brand's colour roles, including role-against-role contrast.
function paletteReport(colors) {
  const roles = Object.keys(colors).filter((r) => hexToRgb(colors[r]));
  const report = { roles: {}, pairs: [] };
  for (const r of roles) report.roles[r] = describe(colors[r]);
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const ratio = contrastRatio(colors[roles[i]], colors[roles[j]]);
      report.pairs.push({ a: roles[i], b: roles[j], ratio, rating: wcag(ratio) });
    }
  }
  return report;
}

// k-means on RGBA pixel data (Uint8ClampedArray / Buffer / array). Skips transparent pixels and,
// by default, near-white/near-black background pixels. Returns colours sorted by share.
function extractPalette(pixels, { count = 5, maxSamples = 20000, skipNeutralBackground = true } = {}) {
  const samples = [];
  const total = Math.floor(pixels.length / 4);
  const stride = Math.max(1, Math.floor(total / maxSamples));
  for (let i = 0; i < total; i += stride) {
    const o = i * 4;
    if (pixels[o + 3] < 128) continue;
    const p = { r: pixels[o], g: pixels[o + 1], b: pixels[o + 2] };
    if (skipNeutralBackground) {
      const hsl = rgbToHsl(p);
      if (hsl.l > 0.96 || hsl.l < 0.03) continue;
    }
    samples.push(p);
  }
  if (!samples.length) return [];

  const dist = (a, b) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
  // Deterministic k-means++ style seeding: start with the first sample, then the farthest point.
  const centers = [samples[0]];
  while (centers.length < Math.min(count, samples.length)) {
    let best = null, bestD = -1;
    for (const s of samples) {
      const d = Math.min(...centers.map((c) => dist(s, c)));
      if (d > bestD) { bestD = d; best = s; }
    }
    if (bestD <= 0) break;
    centers.push(best);
  }

  let assign = new Array(samples.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    assign = samples.map((s) => {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => {
        const d = dist(s, c);
        if (d < bd) { bd = d; bi = i; }
      });
      return bi;
    });
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    samples.forEach((s, i) => {
      const t = sums[assign[i]];
      t.r += s.r; t.g += s.g; t.b += s.b; t.n++;
    });
    sums.forEach((t, i) => {
      if (t.n) centers[i] = { r: t.r / t.n, g: t.g / t.n, b: t.b / t.n };
    });
  }

  const counts = centers.map(() => 0);
  assign.forEach((a) => counts[a]++);
  return centers
    .map((c, i) => ({ hex: rgbToHex(c), share: Math.round((counts[i] / samples.length) * 1000) / 10 }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share);
}

// Picks primary/secondary/accent from an extracted palette. Tiny areas (outlines, anti-aliasing,
// under 3 %) are ignored when there are enough real colours. Most common = primary; the most
// saturated colour that clearly differs from it = accent; the next most common = secondary.
function suggestRoles(palette) {
  if (!palette.length) return {};
  const significant = palette.filter((p) => p.share >= 3);
  const list = (significant.length >= 2 ? significant : palette).map((p) => p.hex);
  const primary = list[0];
  const rest = list.slice(1);
  if (!rest.length) {
    const d = describe(primary);
    return { primary, secondary: d.shades[2].hex, accent: d.tints[1].hex };
  }
  const pr = hexToRgb(primary);
  const dist = (h) => {
    const c = hexToRgb(h);
    return Math.sqrt((c.r - pr.r) ** 2 + (c.g - pr.g) ** 2 + (c.b - pr.b) ** 2);
  };
  const vivid = (h) => {
    const { s, l } = rgbToHsl(hexToRgb(h));
    return s * (1 - Math.abs(l - 0.5)); // saturated and mid-light beats dark or washed-out
  };
  const candidates = rest.filter((h) => dist(h) > 60);
  const accent = (candidates.length ? candidates : rest).slice().sort((a, b) => vivid(b) - vivid(a))[0];
  const others = rest.filter((h) => h !== accent);
  const secondary = others.length ? others[0] : describe(primary).tints[2].hex;
  return { primary, secondary, accent };
}

module.exports = {
  hexToRgb, rgbToHex, rgbToCmyk, rgbToHsl, tintsAndShades, contrastRatio, wcag,
  describe, paletteReport, extractPalette, suggestRoles,
};

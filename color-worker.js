/**
 * Color conversion pipeline — runs off the main thread.
 * Input: ImageData buffer already drawn at (sw × sh) = (gw*ss × gh*ss)
 * Output: palette, targets, fidelity %
 */
"use strict";

function rgbKey(r, g, b) {
  return (r << 16) | (g << 8) | b;
}
function toHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}
function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function rgbToLab(r, g, b) {
  let R = srgbToLinear(r);
  let G = srgbToLinear(g);
  let B = srgbToLinear(b);
  let x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  x /= 0.95047;
  z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
function distLabRGB(a, b) {
  const A = rgbToLab(a[0], a[1], a[2]);
  const B = rgbToLab(b[0], b[1], b[2]);
  const dL = A[0] - B[0];
  const da = A[1] - B[1];
  const db = A[2] - B[2];
  return dL * dL + da * da + db * db;
}

function sampleGridFromData(data, sw, sh, gw, gh, quality, keepEdges) {
  const scaleMap = { draft: 2, balanced: 4, max: 6 };
  const ss = scaleMap[quality] || 4;
  const cells = new Array(gw * gh);
  const edgeThresh = quality === "max" ? 12 : quality === "balanced" ? 28 : 55;

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sumR = 0,
        sumG = 0,
        sumB = 0,
        n = 0;
      let sumL = 0,
        sumL2 = 0;
      const hist = new Map();
      const samples = [];

      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = gx * ss + sx;
          const py = gy * ss + sy;
          const o = (py * sw + px) * 4;
          const r = data[o];
          const g = data[o + 1];
          const b = data[o + 2];
          sumR += r;
          sumG += g;
          sumB += b;
          const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          sumL += L;
          sumL2 += L * L;
          n++;
          samples.push([r, g, b, L]);
          const q = quality === "max" ? 2 : quality === "balanced" ? 4 : 8;
          const key = rgbKey(r - (r % q), g - (g % q), b - (b % q));
          hist.set(key, (hist.get(key) || 0) + 1);
        }
      }

      const mean = [clampByte(sumR / n), clampByte(sumG / n), clampByte(sumB / n)];
      const variance = sumL2 / n - (sumL / n) * (sumL / n);

      if (keepEdges && hist.size > 1 && variance > edgeThresh) {
        let bestKey = 0;
        let bestW = -1;
        for (const [key, w] of hist) {
          if (w > bestW) {
            bestW = w;
            bestKey = key;
          }
        }
        cells[gy * gw + gx] = [
          (bestKey >> 16) & 255,
          (bestKey >> 8) & 255,
          bestKey & 255,
        ];
      } else if (quality === "max" && samples.length) {
        const rs = samples.map((s) => s[0]).sort((a, b) => a - b);
        const gs = samples.map((s) => s[1]).sort((a, b) => a - b);
        const bs = samples.map((s) => s[2]).sort((a, b) => a - b);
        const mid = (samples.length / 2) | 0;
        cells[gy * gw + gx] = [rs[mid], gs[mid], bs[mid]];
      } else {
        cells[gy * gw + gx] = mean;
      }
    }
  }
  return cells;
}

function scoreFidelity(cells, targets, palette) {
  if (!cells.length || !targets.length) return 0;
  let total = 0;
  const step = Math.max(1, (cells.length / 900) | 0);
  let n = 0;
  for (let i = 0; i < cells.length; i += step) {
    const a = cells[i];
    const b = palette[targets[i]].rgb;
    const d = Math.sqrt(distLabRGB(a, b));
    total += Math.max(0, 1 - d / 55);
    n++;
  }
  const detailBonus = Math.min(8, (Math.sqrt(cells.length) / 14) * 2);
  const colorBonus = Math.min(6, palette.length / 10);
  return Math.min(99, Math.round((total / n) * 88 + detailBonus + colorBonus));
}

function channelRangeLab(pts) {
  let minL = Infinity,
    minA = Infinity,
    minB = Infinity;
  let maxL = -Infinity,
    maxA = -Infinity,
    maxB = -Infinity;
  for (const p of pts) {
    const lab = p.lab || (p.lab = rgbToLab(p.c[0], p.c[1], p.c[2]));
    minL = Math.min(minL, lab[0]);
    maxL = Math.max(maxL, lab[0]);
    minA = Math.min(minA, lab[1]);
    maxA = Math.max(maxA, lab[1]);
    minB = Math.min(minB, lab[2]);
    maxB = Math.max(maxB, lab[2]);
  }
  const ranges = [maxL - minL, maxA - minA, maxB - minB];
  let ch = 0;
  if (ranges[1] > ranges[ch]) ch = 1;
  if (ranges[2] > ranges[ch]) ch = 2;
  return { ch, range: ranges[ch] };
}

function medianCut(points, k) {
  if (!points.length) return [];
  for (const p of points) p.lab = rgbToLab(p.c[0], p.c[1], p.c[2]);
  let boxes = [{ pts: points }];
  while (boxes.length < k) {
    boxes.sort((a, b) => {
      const va = channelRangeLab(a.pts);
      const vb = channelRangeLab(b.pts);
      return vb.range * Math.sqrt(b.pts.length) - va.range * Math.sqrt(a.pts.length);
    });
    const box = boxes.shift();
    if (!box || box.pts.length < 2) {
      if (box) boxes.push(box);
      break;
    }
    const { ch } = channelRangeLab(box.pts);
    box.pts.sort((a, b) => a.lab[ch] - b.lab[ch]);
    let totalW = 0;
    for (const p of box.pts) totalW += p.w;
    let acc = 0;
    let mid = 1;
    for (let i = 0; i < box.pts.length - 1; i++) {
      acc += box.pts[i].w;
      if (acc >= totalW / 2) {
        mid = i + 1;
        break;
      }
    }
    boxes.push({ pts: box.pts.slice(0, mid) }, { pts: box.pts.slice(mid) });
  }
  return boxes.map((box) => {
    let r = 0,
      g = 0,
      b = 0,
      w = 0;
    for (const p of box.pts) {
      r += p.c[0] * p.w;
      g += p.c[1] * p.w;
      b += p.c[2] * p.w;
      w += p.w;
    }
    return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
  });
}

function nearest(c, centers, centerLabs) {
  const labs = centerLabs || centers.map((cc) => rgbToLab(cc[0], cc[1], cc[2]));
  const cl = rgbToLab(c[0], c[1], c[2]);
  let best = 0,
    bestD = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const L = labs[i];
    const dL = cl[0] - L[0];
    const da = cl[1] - L[1];
    const db = cl[2] - L[2];
    const d = dL * dL + da * da + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function floydSteinberg(cells, gw, gh, centers) {
  const work = cells.map((c) => [c[0], c[1], c[2]]);
  const mapped = new Array(work.length);
  const labs = centers.map((cc) => rgbToLab(cc[0], cc[1], cc[2]));
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const old = work[i];
      const idx = nearest(old, centers, labs);
      mapped[i] = idx;
      const nc = centers[idx];
      const err = [old[0] - nc[0], old[1] - nc[1], old[2] - nc[2]];
      const spread = (nx, ny, f) => {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return;
        const j = ny * gw + nx;
        work[j][0] = Math.min(255, Math.max(0, work[j][0] + err[0] * f));
        work[j][1] = Math.min(255, Math.max(0, work[j][1] + err[1] * f));
        work[j][2] = Math.min(255, Math.max(0, work[j][2] + err[2] * f));
      };
      spread(x + 1, y, 7 / 16);
      spread(x - 1, y + 1, 3 / 16);
      spread(x, y + 1, 5 / 16);
      spread(x + 1, y + 1, 1 / 16);
    }
  }
  return mapped;
}

function refineKMeans(points, centers, iters) {
  for (let iter = 0; iter < iters; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    const labs = centers.map((cc) => rgbToLab(cc[0], cc[1], cc[2]));
    for (const p of points) {
      const best = nearest(p.c, centers, labs);
      sums[best][0] += p.c[0] * p.w;
      sums[best][1] += p.c[1] * p.w;
      sums[best][2] += p.c[2] * p.w;
      sums[best][3] += p.w;
    }
    for (let i = 0; i < centers.length; i++) {
      if (!sums[i][3]) continue;
      centers[i] = [
        Math.round(sums[i][0] / sums[i][3]),
        Math.round(sums[i][1] / sums[i][3]),
        Math.round(sums[i][2] / sums[i][3]),
      ];
    }
  }
  return centers;
}

function quantize(cells, k, dither, gw, gh, quality) {
  const unique = new Map();
  const crush = quality === "draft" ? 8 : quality === "balanced" ? 4 : 1;
  for (const c of cells) {
    const r = c[0] - (c[0] % crush);
    const g = c[1] - (c[1] % crush);
    const b = c[2] - (c[2] % crush);
    const key = rgbKey(r, g, b);
    unique.set(key, (unique.get(key) || 0) + 1);
  }
  let points = [...unique.entries()].map(([key, w]) => ({
    c: [(key >> 16) & 255, (key >> 8) & 255, key & 255],
    w,
  }));
  if (points.length > 8000) {
    points.sort((a, b) => b.w - a.w);
    points = points.slice(0, 8000);
  }
  const useK = Math.min(k, Math.max(1, points.length));
  let centers = medianCut(points, useK);
  const iters = quality === "max" ? 24 : quality === "balanced" ? 14 : 8;
  centers = refineKMeans(points, centers, iters);

  let mapped;
  const labs = centers.map((cc) => rgbToLab(cc[0], cc[1], cc[2]));
  if (dither) mapped = floydSteinberg(cells, gw, gh, centers);
  else mapped = cells.map((c) => nearest(c, centers, labs));

  const counts = new Array(centers.length).fill(0);
  for (const i of mapped) counts[i]++;

  const order = counts
    .map((count, i) => ({ i, count }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  const remap = new Array(centers.length).fill(-1);
  const palette = order.map((o, ni) => {
    remap[o.i] = ni;
    return { rgb: centers[o.i], hex: toHex(centers[o.i]), total: o.count };
  });
  const targets = mapped.map((i) => remap[i]);
  return { palette, targets };
}

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg || msg.type !== "analyze") return;
  const { id, buffer, sw, sh, gw, gh, quality, keepEdges, colorCount, dither } = msg;
  try {
    self.postMessage({ type: "progress", id, phase: "sample", pct: 10 });
    const data = new Uint8ClampedArray(buffer);
    const cells = sampleGridFromData(data, sw, sh, gw, gh, quality, keepEdges);
    self.postMessage({ type: "progress", id, phase: "quantize", pct: 55 });
    const result = quantize(cells, colorCount, dither, gw, gh, quality);
    self.postMessage({ type: "progress", id, phase: "score", pct: 90 });
    const fidelity = scoreFidelity(cells, result.targets, result.palette);
    self.postMessage({
      type: "done",
      id,
      palette: result.palette,
      targets: result.targets,
      fidelity,
      pct: 100,
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      id,
      message: err && err.message ? err.message : String(err),
    });
  }
};

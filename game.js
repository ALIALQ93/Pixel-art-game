(() => {
  "use strict";

  const STORAGE_KEY = "pixel-atelier-v3";
  const MAX_UNDO = 80;

  const $ = (id) => document.getElementById(id);

  const els = {
    setup: $("setup"),
    workspace: $("workspace"),
    dropzone: $("dropzone"),
    fileInput: $("file-input"),
    gridSize: $("grid-size"),
    colorCount: $("color-count"),
    gridLabel: $("grid-size-label"),
    colorLabel: $("color-count-label"),
    dither: $("dither-toggle"),
    edgeToggle: $("edge-toggle"),
    qualityMode: $("quality-mode"),
    qualityLabel: $("quality-label"),
    fitMode: $("fit-mode"),
    analyzing: $("analyzing"),
    startBtn: $("start-btn"),
    resumeBtn: $("resume-btn"),
    previewRow: $("preview-row"),
    previewOriginal: $("preview-original"),
    previewPixel: $("preview-pixel"),
    sourceMeta: $("source-meta"),
    pixelMeta: $("pixel-meta"),
    estCells: $("est-cells"),
    estColors: $("est-colors"),
    estTime: $("est-time"),
    fidelityValue: $("fidelity-value"),
    demoGallery: $("demo-gallery"),
    board: $("board"),
    fx: $("overlay-fx"),
    stage: $("stage"),
    palette: $("palette"),
    progressFill: $("progress-fill"),
    progressText: $("progress-text"),
    cellsText: $("cells-text"),
    timerText: $("timer-text"),
    doneBanner: $("done-banner"),
    doneStats: $("done-stats"),
    wrongFlash: $("wrong-flash"),
    refImage: $("ref-image"),
    zoomLabel: $("zoom-label"),
    zoomSlider: $("zoom-slider"),
    toast: $("toast"),
    sessionTitle: $("session-title"),
    autoNext: $("auto-next"),
    soundBtn: $("sound-btn"),
  };

  const ctx = els.board.getContext("2d");
  const fx = els.fx.getContext("2d");
  const origCtx = els.previewOriginal.getContext("2d");
  const pixCtx = els.previewPixel.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  pixCtx.imageSmoothingEnabled = false;

  const state = {
    sourceImage: null,
    sourceName: "بدون عنوان",
    gridSize: 48,
    gridW: 48,
    gridH: 48,
    colorCount: 24,
    useDither: false,
    keepEdges: true,
    quality: "balanced",
    fit: "cover",
    palette: [],
    targets: [],
    painted: [],
    selectedColor: 0,
    tool: "brush",
    focusMode: false,
    showHint: false,
    showGrid: true,
    showRef: false,
    soundOn: true,
    painting: false,
    panning: false,
    spaceHeld: false,
    cam: { x: 0, y: 0, zoom: 1 },
    pointer: { x: 0, y: 0, lastX: 0, lastY: 0 },
    pinch: null,
    panHold: null,
    undo: [],
    redo: [],
    mistimed: 0,
    startedAt: 0,
    timerId: null,
    particles: [],
    completed: false,
    needsDraw: true,
    hoverCell: -1,
  };

  // ——— Audio (soft UI beeps) ———
  let audioCtx = null;
  function beep(kind) {
    if (!state.soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (kind === "paint") {
        o.frequency.value = 620;
        g.gain.setValueAtTime(0.04, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        o.type = "triangle";
        o.start(now);
        o.stop(now + 0.07);
      } else if (kind === "wrong") {
        o.frequency.value = 160;
        g.gain.setValueAtTime(0.05, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        o.type = "sawtooth";
        o.start(now);
        o.stop(now + 0.13);
      } else if (kind === "done") {
        [523, 659, 784].forEach((f, i) => {
          const o2 = audioCtx.createOscillator();
          const g2 = audioCtx.createGain();
          o2.connect(g2);
          g2.connect(audioCtx.destination);
          o2.frequency.value = f;
          o2.type = "sine";
          const t = now + i * 0.1;
          g2.gain.setValueAtTime(0.05, t);
          g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          o2.start(t);
          o2.stop(t + 0.26);
        });
      } else if (kind === "complete-color") {
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.04, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        o.type = "sine";
        o.start(now);
        o.stop(now + 0.16);
      }
    } catch (_) {
      /* ignore */
    }
  }

  function toast(msg) {
    els.toast.hidden = false;
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      els.toast.classList.remove("show");
    }, 2200);
  }

  // ——— Color helpers (CIE Lab for perceptual accuracy) ———
  function rgbKey(r, g, b) {
    return (r << 16) | (g << 8) | b;
  }
  function toHex([r, g, b]) {
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function luminance([r, g, b]) {
    return (r * 299 + g * 587 + b * 114) / 1000;
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
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function distLabRGB(a, b) {
    const A = rgbToLab(a[0], a[1], a[2]);
    const B = rgbToLab(b[0], b[1], b[2]);
    const dL = A[0] - B[0];
    const da = A[1] - B[1];
    const db = A[2] - B[2];
    return dL * dL + da * da + db * db;
  }

  function fitImage(ctx2, img, size, mode) {
    ctx2.fillStyle = "#fdf6f0";
    ctx2.fillRect(0, 0, size, size);
    const scale =
      mode === "cover"
        ? Math.max(size / img.width, size / img.height)
        : Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx2.imageSmoothingEnabled = true;
    ctx2.imageSmoothingQuality = "high";
    ctx2.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  }

  function computeGridDims(img, maxSide) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw >= ih) {
      const gw = maxSide;
      const gh = Math.max(8, Math.round((maxSide * ih) / iw));
      return { gw, gh };
    }
    const gh = maxSide;
    const gw = Math.max(8, Math.round((maxSide * iw) / ih));
    return { gw, gh };
  }

  /** Draw source into canvas using cover/contain */
  function drawFitted(t, img, w, h, fit) {
    t.fillStyle = fit === "contain" ? "#ffffff" : "#fdf6f0";
    t.fillRect(0, 0, w, h);
    const scale =
      fit === "cover"
        ? Math.max(w / img.width, h / img.height)
        : Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = "high";
    t.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  /**
   * High-detail grid sampling with edge-aware color picking.
   * Returns { cells, sourceData, sw, sh, ss } for fidelity scoring.
   */
  function sampleGridHD(img, gw, gh, quality, fit, keepEdges) {
    const scaleMap = { draft: 2, balanced: 4, max: 6 };
    const ss = scaleMap[quality] || 4;
    const sw = gw * ss;
    const sh = gh * ss;

    const tmp = document.createElement("canvas");
    tmp.width = sw;
    tmp.height = sh;
    const t = tmp.getContext("2d", { willReadFrequently: true });
    drawFitted(t, img, sw, sh, fit);
    const data = t.getImageData(0, 0, sw, sh).data;
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
          // Dominant color on edges — keeps thin lines and sharp boundaries
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
          // Median channel values reduce noise while keeping detail
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
    return { cells, data, sw, sh, ss };
  }

  /** Compare quantized result vs pre-quantized sample for a fidelity % */
  function scoreFidelity(cells, targets, palette) {
    if (!cells.length || !targets.length) return 0;
    let total = 0;
    const step = Math.max(1, (cells.length / 900) | 0);
    let n = 0;
    for (let i = 0; i < cells.length; i += step) {
      const a = cells[i];
      const b = palette[targets[i]].rgb;
      const d = Math.sqrt(distLabRGB(a, b));
      // Lab distance ~0–100+ ; map to similarity
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

  /** Median-cut in Lab space for better color separation */
  function medianCut(points, k) {
    if (!points.length) return [];
    for (const p of points) p.lab = rgbToLab(p.c[0], p.c[1], p.c[2]);
    let boxes = [{ pts: points }];
    while (boxes.length < k) {
      boxes.sort((a, b) => {
        const va = channelRangeLab(a.pts);
        const vb = channelRangeLab(b.pts);
        // prefer both volume and population
        return vb.range * Math.sqrt(b.pts.length) - va.range * Math.sqrt(a.pts.length);
      });
      const box = boxes.shift();
      if (!box || box.pts.length < 2) {
        if (box) boxes.push(box);
        break;
      }
      const { ch } = channelRangeLab(box.pts);
      box.pts.sort((a, b) => a.lab[ch] - b.lab[ch]);
      // split by median weight, not index (better for skewed histograms)
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
    // Keep full precision for max quality; light crush only for speed modes
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

    // Cap histogram size for performance while keeping most important colors
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

  let analyzeTimer = null;
  function analyze() {
    if (!state.sourceImage) return;
    clearTimeout(analyzeTimer);
    const delay = els.qualityMode.value === "max" ? 180 : 60;
    if (els.analyzing) els.analyzing.hidden = false;
    els.startBtn.disabled = true;
    analyzeTimer = setTimeout(runAnalyze, delay);
  }

  function runAnalyze() {
    if (!state.sourceImage) return;
    const maxSide = Number(els.gridSize.value);
    state.colorCount = Number(els.colorCount.value);
    state.useDither = els.dither.checked;
    state.keepEdges = els.edgeToggle ? els.edgeToggle.checked : true;
    state.quality = els.qualityMode.value;
    state.fit = els.fitMode.value;

    const { gw, gh } = computeGridDims(state.sourceImage, maxSide);
    state.gridSize = maxSide;
    state.gridW = gw;
    state.gridH = gh;

    els.gridLabel.textContent = gw + "×" + gh;
    els.colorLabel.textContent = String(state.colorCount);
    const qNames = { draft: "سريعة", balanced: "متوازنة", max: "أقصى دقة" };
    if (els.qualityLabel) els.qualityLabel.textContent = qNames[state.quality] || state.quality;

    fitImage(origCtx, state.sourceImage, els.previewOriginal.width, state.fit);
    els.sourceMeta.textContent =
      (state.sourceImage.naturalWidth || state.sourceImage.width) +
      "×" +
      (state.sourceImage.naturalHeight || state.sourceImage.height);

    const sampled = sampleGridHD(
      state.sourceImage,
      gw,
      gh,
      state.quality,
      state.fit,
      state.keepEdges
    );
    const result = quantize(
      sampled.cells,
      state.colorCount,
      state.useDither,
      gw,
      gh,
      state.quality
    );
    state.palette = result.palette;
    state.targets = result.targets;

    // Preview with correct aspect
    const pw = els.previewPixel.width;
    const ph = els.previewPixel.height;
    pixCtx.fillStyle = "#fdf6f0";
    pixCtx.fillRect(0, 0, pw, ph);
    const cell = Math.min(pw / gw, ph / gh);
    const ox = (pw - cell * gw) / 2;
    const oy = (ph - cell * gh) / 2;
    pixCtx.imageSmoothingEnabled = false;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const idx = state.targets[y * gw + x];
        pixCtx.fillStyle = state.palette[idx].hex;
        pixCtx.fillRect(
          (ox + x * cell) | 0,
          (oy + y * cell) | 0,
          Math.ceil(cell),
          Math.ceil(cell)
        );
      }
    }

    const total = gw * gh;
    const fidelity = scoreFidelity(sampled.cells, state.targets, state.palette);
    els.pixelMeta.textContent = gw + "×" + gh + " · " + state.palette.length + " لون";
    els.estCells.textContent = gw + "×" + gh;
    els.estColors.textContent = String(state.palette.length);
    const mins = Math.max(1, Math.round(total / 40));
    els.estTime.textContent = mins < 60 ? mins + " د" : Math.round(mins / 60) + " س";
    if (els.fidelityValue) {
      els.fidelityValue.textContent = fidelity + "%";
      const ring = els.fidelityValue.closest(".fidelity-score");
      if (ring) {
        ring.style.borderColor =
          fidelity >= 85 ? "var(--good)" : fidelity >= 70 ? "var(--accent)" : "var(--warm)";
      }
    }

    els.startBtn.disabled = false;
    els.previewRow.hidden = false;
    if (els.analyzing) els.analyzing.hidden = true;
  }

  function setImage(img, name) {
    state.sourceImage = img;
    state.sourceName = name || "صورة";
    els.sessionTitle.textContent = state.sourceName;
    els.refImage.src = img.src || img.toDataURL?.() || "";
    analyze();
  }

  let lastObjectUrl = null;
  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      toast("الملف ليس صورة صالحة");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast("الصورة كبيرة جداً (الحد 15MB)");
      return;
    }
    if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
    const url = URL.createObjectURL(file);
    lastObjectUrl = url;
    const img = new Image();
    img.onload = () => {
      setImage(img, file.name.replace(/\.[^.]+$/, ""));
      toast("تم تحليل الصورة");
    };
    img.onerror = () => toast("تعذّر تحميل الصورة");
    img.src = url;
  }

  // ——— Demo generators ———
  function makeDemo(kind) {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 160;
    const x = c.getContext("2d");

    if (kind === "cabin") {
      const g = x.createLinearGradient(0, 0, 0, 160);
      g.addColorStop(0, "#4db8e8");
      g.addColorStop(1, "#d7f1fa");
      x.fillStyle = g;
      x.fillRect(0, 0, 160, 160);
      x.fillStyle = "#f5d76e";
      x.beginPath(); x.arc(128, 36, 18, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#3f8f4e";
      x.beginPath(); x.ellipse(40, 140, 60, 40, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(120, 145, 70, 36, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#ead7b5"; x.fillRect(56, 78, 50, 42);
      x.fillStyle = "#c25a3c";
      x.beginPath(); x.moveTo(50, 78); x.lineTo(81, 50); x.lineTo(112, 78); x.fill();
      x.fillStyle = "#6b3e2e"; x.fillRect(74, 96, 14, 24);
      x.fillStyle = "#7ec8e8"; x.fillRect(62, 88, 12, 12);
      x.fillStyle = "#6b4a2e"; x.fillRect(28, 92, 10, 36);
      x.fillStyle = "#2f7a3a"; x.beginPath(); x.arc(33, 84, 18, 0, Math.PI * 2); x.fill();
    } else if (kind === "cat") {
      x.fillStyle = "#2a3340"; x.fillRect(0, 0, 160, 160);
      x.fillStyle = "#f0c48a";
      x.beginPath(); x.ellipse(80, 95, 42, 36, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.moveTo(48, 70); x.lineTo(58, 38); x.lineTo(72, 68); x.fill();
      x.beginPath(); x.moveTo(112, 70); x.lineTo(102, 38); x.lineTo(88, 68); x.fill();
      x.fillStyle = "#1a1a1a";
      x.beginPath(); x.arc(66, 92, 5, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(94, 92, 5, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#e08a6a";
      x.beginPath(); x.moveTo(80, 100); x.lineTo(74, 108); x.lineTo(86, 108); x.fill();
      x.strokeStyle = "#d0a878"; x.lineWidth = 2;
      x.beginPath(); x.moveTo(40, 104); x.lineTo(20, 100); x.moveTo(40, 110); x.lineTo(20, 114); x.stroke();
      x.beginPath(); x.moveTo(120, 104); x.lineTo(140, 100); x.moveTo(120, 110); x.lineTo(140, 114); x.stroke();
    } else if (kind === "sunset") {
      const g = x.createLinearGradient(0, 0, 0, 160);
      g.addColorStop(0, "#1b2a4a");
      g.addColorStop(0.45, "#c45c4a");
      g.addColorStop(1, "#f0b46a");
      x.fillStyle = g; x.fillRect(0, 0, 160, 160);
      x.fillStyle = "#f5d070"; x.beginPath(); x.arc(80, 95, 28, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#1a2433";
      x.beginPath(); x.moveTo(0, 160); x.lineTo(0, 120); x.lineTo(40, 95); x.lineTo(70, 125); x.lineTo(110, 90); x.lineTo(160, 118); x.lineTo(160, 160); x.fill();
    } else {
      // geometric
      x.fillStyle = "#14202b"; x.fillRect(0, 0, 160, 160);
      const cols = ["#b7a4e0", "#f0b45a", "#9fc7e8", "#f2b8c6", "#a8d8cf"];
      for (let i = 0; i < 18; i++) {
        x.fillStyle = cols[i % cols.length];
        const s = 18 + (i % 5) * 8;
        x.fillRect((i * 37) % 140, (i * 23) % 140, s, s);
      }
      x.fillStyle = "#eef3f7";
      x.beginPath(); x.arc(80, 80, 22, 0, Math.PI * 2); x.fill();
    }

    return c;
  }

  function buildGallery() {
    const demos = [
      { id: "cabin", name: "كوخ" },
      { id: "cat", name: "قطة" },
      { id: "sunset", name: "غروب" },
      { id: "geo", name: "أشكال" },
    ];
    els.demoGallery.innerHTML = "";
    demos.forEach((d) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "demo-thumb";
      btn.title = d.name;
      const c = makeDemo(d.id);
      const thumb = document.createElement("canvas");
      thumb.width = 52;
      thumb.height = 52;
      const tctx = thumb.getContext("2d");
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(c, 0, 0, 52, 52);
      btn.appendChild(thumb);
      btn.addEventListener("click", () => {
        [...els.demoGallery.children].forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const img = new Image();
        img.onload = () => setImage(img, d.name);
        img.src = c.toDataURL("image/png");
      });
      els.demoGallery.appendChild(btn);
    });
  }

  // ——— Session / persist ———
  function remaining(colorIndex) {
    let n = 0;
    for (let i = 0; i < state.targets.length; i++) {
      if (state.targets[i] === colorIndex && !state.painted[i]) n++;
    }
    return n;
  }

  function countDone() {
    return state.painted.reduce((a, v) => a + (v ? 1 : 0), 0);
  }

  function pushUndo(indices) {
    if (!indices.length) return;
    state.undo.push(indices);
    if (state.undo.length > MAX_UNDO) state.undo.shift();
    state.redo = [];
    syncHistoryButtons();
  }

  function syncHistoryButtons() {
    $("undo-btn").disabled = !state.undo.length;
    $("redo-btn").disabled = !state.redo.length;
  }

  function saveSession() {
    if (!state.targets.length || els.workspace.hidden) return;
    try {
      const payload = {
        name: state.sourceName,
        gridSize: state.gridSize,
        gridW: state.gridW,
        gridH: state.gridH,
        colorCount: state.colorCount,
        useDither: state.useDither,
        keepEdges: state.keepEdges,
        quality: state.quality,
        fit: state.fit,
        palette: state.palette,
        targets: state.targets,
        painted: state.painted,
        selectedColor: state.selectedColor,
        mistimed: state.mistimed,
        elapsed: Date.now() - state.startedAt,
        image: (() => {
          const c = document.createElement("canvas");
          const iw = state.sourceImage.width;
          const ih = state.sourceImage.height;
          const s = Math.min(1, 320 / Math.max(iw, ih));
          c.width = Math.max(1, Math.round(iw * s));
          c.height = Math.max(1, Math.round(ih * s));
          c.getContext("2d").drawImage(state.sourceImage, 0, 0, c.width, c.height);
          return c.toDataURL("image/jpeg", 0.82);
        })(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {
      /* quota */
    }
  }

  function hasSaved() {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  }

  function resumeSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const img = new Image();
      img.onload = () => {
        state.sourceImage = img;
        state.sourceName = data.name || "جلسة محفوظة";
        state.gridSize = data.gridSize || data.gridW || 48;
        state.gridW = data.gridW || data.gridSize || 48;
        state.gridH = data.gridH || data.gridSize || 48;
        state.palette = data.palette;
        state.targets = data.targets;
        state.painted = data.painted;
        state.selectedColor = data.selectedColor || 0;
        state.mistimed = data.mistimed || 0;
        els.sessionTitle.textContent = state.sourceName;
        els.refImage.src = img.src;
        enterWorkspace(false, data.elapsed || 0);
        toast("تم استئناف الجلسة");
      };
      img.src = data.image;
    } catch {
      toast("تعذّر استئناف الجلسة");
    }
  }

  // ——— Tools / paint ———
  function paintCells(indices, { record = true } = {}) {
    const applied = [];
    for (const i of indices) {
      if (i < 0 || i >= state.painted.length) continue;
      if (state.painted[i]) continue;
      if (state.targets[i] !== state.selectedColor) continue;
      state.painted[i] = true;
      applied.push(i);
    }
    if (!applied.length) return false;
    if (record) pushUndo(applied);
    afterPaint(applied.length);
    return true;
  }

  function tryPaintAt(cell) {
    if (cell < 0 || state.completed) return;
    if (state.painted[cell]) return;
    if (state.targets[cell] !== state.selectedColor) {
      state.mistimed++;
      beep("wrong");
      els.wrongFlash.hidden = false;
      clearTimeout(tryPaintAt._t);
      tryPaintAt._t = setTimeout(() => {
        els.wrongFlash.hidden = true;
      }, 220);
      return;
    }
    if (state.tool === "fill") {
      const filled = flood(cell);
      if (filled.length) {
        pushUndo(filled);
        for (const i of filled) state.painted[i] = true;
        afterPaint(filled.length);
      }
    } else {
      paintCells([cell]);
    }
  }

  function flood(start) {
    const color = state.targets[start];
    if (color !== state.selectedColor || state.painted[start]) return [];
    const gw = state.gridW;
    const gh = state.gridH;
    const seen = new Uint8Array(gw * gh);
    const stack = [start];
    const out = [];
    while (stack.length) {
      const i = stack.pop();
      if (seen[i]) continue;
      seen[i] = 1;
      if (state.targets[i] !== color || state.painted[i]) continue;
      out.push(i);
      const x = i % gw;
      const y = (i / gw) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < gw - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - gw);
      if (y < gh - 1) stack.push(i + gw);
    }
    return out;
  }

  function afterPaint(n) {
    beep("paint");
    updateProgress();
    renderPalette();
    state.needsDraw = true;
    saveSession();

    if (remaining(state.selectedColor) === 0) {
      beep("complete-color");
      spawnBurst();
      if (els.autoNext.checked) selectNextColor();
    }
    if (countDone() === state.targets.length) completePuzzle();
  }

  function selectNextColor() {
    for (let i = 0; i < state.palette.length; i++) {
      const idx = (state.selectedColor + 1 + i) % state.palette.length;
      if (remaining(idx) > 0) {
        state.selectedColor = idx;
        renderPalette();
        state.needsDraw = true;
        return;
      }
    }
  }

  function undo() {
    const batch = state.undo.pop();
    if (!batch) return;
    for (const i of batch) state.painted[i] = false;
    state.redo.push(batch);
    syncHistoryButtons();
    updateProgress();
    renderPalette();
    state.needsDraw = true;
    saveSession();
  }

  function redo() {
    const batch = state.redo.pop();
    if (!batch) return;
    for (const i of batch) state.painted[i] = true;
    state.undo.push(batch);
    syncHistoryButtons();
    updateProgress();
    renderPalette();
    state.needsDraw = true;
    saveSession();
  }

  function updateProgress() {
    const total = state.targets.length;
    const done = countDone();
    const pct = total ? Math.round((done / total) * 100) : 0;
    els.progressFill.style.width = pct + "%";
    els.progressText.textContent = pct + "%";
    els.cellsText.textContent = done + " / " + total;
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, "0");
    return String(m).padStart(2, "0") + ":" + ss;
  }

  function startTimer(offset) {
    state.startedAt = Date.now() - (offset || 0);
    clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      els.timerText.textContent = formatTime(Date.now() - state.startedAt);
    }, 500);
    els.timerText.textContent = formatTime(offset || 0);
  }

  function completePuzzle() {
    if (state.completed) return;
    state.completed = true;
    beep("done");
    spawnBurst(60);
    const elapsed = formatTime(Date.now() - state.startedAt);
    const accuracy = Math.max(
      0,
      Math.round((1 - state.mistimed / Math.max(1, state.targets.length + state.mistimed)) * 100)
    );
    els.doneStats.textContent =
      "الوقت " + elapsed + " · الدقة " + accuracy + "% · أخطاء " + state.mistimed;
    els.doneBanner.hidden = false;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function spawnBurst(n = 28) {
    const rect = els.stage.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      state.particles.push({
        x: rect.width * (0.3 + Math.random() * 0.4),
        y: rect.height * (0.35 + Math.random() * 0.2),
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 5 - 1,
        life: 40 + Math.random() * 30,
        color: state.palette[(Math.random() * state.palette.length) | 0]?.hex || "#b7a4e0",
        size: 2 + Math.random() * 4,
      });
    }
  }

  function renderPalette() {
    els.palette.innerHTML = "";
    state.palette.forEach((color, i) => {
      const left = remaining(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "swatch" +
        (i === state.selectedColor ? " active" : "") +
        (left === 0 ? " done" : "");
      btn.innerHTML =
        '<span class="chip-color" style="background:' +
        color.hex +
        '"></span>' +
        '<span class="meta"><strong>لون ' +
        (i + 1) +
        "</strong><small>" +
        color.hex.toUpperCase() +
        "</small></span>" +
        '<span class="left">' +
        left +
        "</span>";
      btn.addEventListener("click", () => {
        state.selectedColor = i;
        renderPalette();
        state.needsDraw = true;
      });
      els.palette.appendChild(btn);
    });
  }

  // ——— Camera / board rendering ———
  function resizeBoard() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = els.stage.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (els.board.width !== w || els.board.height !== h) {
      els.board.width = w;
      els.board.height = h;
      els.fx.width = w;
      els.fx.height = h;
      state.needsDraw = true;
    }
  }

  function boardMetrics() {
    const gw = state.gridW;
    const gh = state.gridH;
    const viewW = els.board.width;
    const viewH = els.board.height;
    const pad = 0.92;
    const cell = Math.min((viewW * pad) / gw, (viewH * pad) / gh) * state.cam.zoom;
    const sizeW = cell * gw;
    const sizeH = cell * gh;
    const ox = (viewW - sizeW) / 2 + state.cam.x;
    const oy = (viewH - sizeH) / 2 + state.cam.y;
    return { gw, gh, cell, ox, oy, sizeW, sizeH, viewW, viewH };
  }

  function cellFromEvent(e) {
    const rect = els.board.getBoundingClientRect();
    const dpr = els.board.width / rect.width;
    const px = (e.clientX - rect.left) * dpr;
    const py = (e.clientY - rect.top) * dpr;
    const m = boardMetrics();
    const x = Math.floor((px - m.ox) / m.cell);
    const y = Math.floor((py - m.oy) / m.cell);
    if (x < 0 || y < 0 || x >= m.gw || y >= m.gh) return -1;
    return y * m.gw + x;
  }

  function syncZoomUi() {
    const pct = Math.round(state.cam.zoom * 100);
    els.zoomLabel.textContent = pct + "%";
    if (els.zoomSlider && document.activeElement !== els.zoomSlider) {
      els.zoomSlider.value = String(pct);
    }
  }

  function clampCamera() {
    const m = boardMetrics();
    // Keep at least 20% of the board visible inside the stage
    const marginX = m.viewW * 0.2;
    const marginY = m.viewH * 0.2;
    const minX = marginX - (m.viewW + m.sizeW) / 2;
    const maxX = (m.viewW + m.sizeW) / 2 - marginX;
    const minY = marginY - (m.viewH + m.sizeH) / 2;
    const maxY = (m.viewH + m.sizeH) / 2 - marginY;
    state.cam.x = Math.min(maxX, Math.max(minX, state.cam.x));
    state.cam.y = Math.min(maxY, Math.max(minY, state.cam.y));
  }

  function fitCamera() {
    state.cam.zoom = 1;
    state.cam.x = 0;
    state.cam.y = 0;
    syncZoomUi();
    state.needsDraw = true;
  }

  function setZoom(z, cx, cy) {
    const prev = state.cam.zoom;
    state.cam.zoom = Math.min(6, Math.max(0.5, Math.round(z * 100) / 100));
    if (Math.abs(state.cam.zoom - prev) < 0.001) {
      syncZoomUi();
      return;
    }
    // Zoom toward a point in camera space (default: view center)
    const anchorX = cx != null ? cx : 0;
    const anchorY = cy != null ? cy : 0;
    const scale = state.cam.zoom / prev;
    state.cam.x = anchorX - (anchorX - state.cam.x) * scale;
    state.cam.y = anchorY - (anchorY - state.cam.y) * scale;
    clampCamera();
    syncZoomUi();
    state.needsDraw = true;
  }

  function panBy(dx, dy) {
    state.cam.x += dx;
    state.cam.y += dy;
    clampCamera();
    state.needsDraw = true;
  }

  function panStep(dir) {
    const m = boardMetrics();
    const step = Math.max(24, Math.min(m.viewW, m.viewH) * 0.12);
    if (dir === "up") panBy(0, step);
    if (dir === "down") panBy(0, -step);
    if (dir === "left") panBy(step, 0);
    if (dir === "right") panBy(-step, 0);
  }

  function bindHoldPan(btn, dir) {
    if (!btn) return;
    const start = (e) => {
      e.preventDefault();
      panStep(dir);
      clearInterval(state.panHold);
      state.panHold = setInterval(() => panStep(dir), 60);
    };
    const stop = () => {
      clearInterval(state.panHold);
      state.panHold = null;
    };
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
    btn.addEventListener("pointercancel", stop);
  }

  function drawBoard() {
    resizeBoard();
    const m = boardMetrics();
    ctx.clearRect(0, 0, m.viewW, m.viewH);

    ctx.fillStyle = "#fdf6f0";
    ctx.fillRect(0, 0, m.viewW, m.viewH);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(m.ox - 6, m.oy - 6, m.sizeW + 12, m.sizeH + 12);

    const fontSize = Math.max(6, Math.min(20, m.cell * 0.4));
    const showNums = m.cell >= 9 && state.palette.length <= 64;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + fontSize + "px Tajawal, sans-serif";

    for (let y = 0; y < m.gh; y++) {
      for (let x = 0; x < m.gw; x++) {
        const i = y * m.gw + x;
        const px = m.ox + x * m.cell;
        const py = m.oy + y * m.cell;
        const target = state.targets[i];
        const isSel = target === state.selectedColor;
        const dim = state.focusMode && !isSel && !state.painted[i];

        if (state.painted[i]) {
          ctx.globalAlpha = dim ? 0.35 : 1;
          ctx.fillStyle = state.palette[target].hex;
          ctx.fillRect(px, py, m.cell + 0.5, m.cell + 0.5);
          ctx.globalAlpha = 1;
        } else if (state.showHint) {
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = state.palette[target].hex;
          ctx.fillRect(px, py, m.cell + 0.5, m.cell + 0.5);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = (x + y) % 2 ? "#e7e0d2" : "#f1ece3";
          if (dim) ctx.globalAlpha = 0.35;
          ctx.fillRect(px, py, m.cell + 0.5, m.cell + 0.5);
          ctx.globalAlpha = 1;

          if (isSel) {
            ctx.fillStyle = "rgba(183, 164, 224, 0.28)";
            ctx.fillRect(px, py, m.cell + 0.5, m.cell + 0.5);
          }

          if (showNums) {
            const rgb = state.palette[target].rgb;
            ctx.fillStyle = luminance(rgb) > 150 ? "#4a3b2c" : "#2c241c";
            ctx.globalAlpha = isSel ? 0.95 : dim ? 0.25 : 0.5;
            ctx.fillText(String(target + 1), px + m.cell / 2, py + m.cell / 2 + 0.5);
            ctx.globalAlpha = 1;
          }
        }

        if (state.showGrid && m.cell > 4) {
          ctx.strokeStyle = "rgba(183, 164, 224, 0.15)";
          ctx.lineWidth = Math.max(1, m.cell * 0.03);
          ctx.strokeRect(px + 0.5, py + 0.5, m.cell - 1, m.cell - 1);
        }
      }
    }

    if (state.hoverCell >= 0 && !state.completed) {
      const hx = state.hoverCell % m.gw;
      const hy = (state.hoverCell / m.gw) | 0;
      ctx.strokeStyle = "rgba(138, 118, 196, 0.95)";
      ctx.lineWidth = Math.max(1.5, m.cell * 0.08);
      ctx.strokeRect(m.ox + hx * m.cell + 1, m.oy + hy * m.cell + 1, m.cell - 2, m.cell - 2);
    }

    state.needsDraw = false;
  }

  function drawFx() {
    fx.clearRect(0, 0, els.fx.width, els.fx.height);
    if (!state.particles.length) return;
    const next = [];
    for (const p of state.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 1;
      if (p.life <= 0) continue;
      fx.globalAlpha = Math.min(1, p.life / 20);
      fx.fillStyle = p.color;
      fx.fillRect(p.x, p.y, p.size, p.size);
      next.push(p);
    }
    fx.globalAlpha = 1;
    state.particles = next;
  }

  function loop() {
    if (!els.workspace.hidden && (state.needsDraw || state.particles.length)) {
      if (state.needsDraw) drawBoard();
      drawFx();
    }
    requestAnimationFrame(loop);
  }

  function enterWorkspace(fresh, elapsedOffset) {
    els.setup.hidden = true;
    els.workspace.hidden = false;
    els.doneBanner.hidden = true;
    state.completed = false;
    state.tool = "brush";
    setTool("brush");
    state.focusMode = false;
    state.showHint = false;
    state.showGrid = true;
    state.showRef = false;
    syncToggles();
    if (fresh) {
      state.painted = new Array(state.targets.length).fill(false);
      state.selectedColor = 0;
      state.mistimed = 0;
      state.undo = [];
      state.redo = [];
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    } else if (
      state.painted.length !== state.targets.length ||
      !state.targets.length
    ) {
      state.painted = new Array(state.targets.length).fill(false);
    }
    // جلسة محفوظة مكتملة مسبقاً → ابدأ من جديد بدل حظر اللعب
    if (!fresh && countDone() === state.targets.length && state.targets.length) {
      state.painted = new Array(state.targets.length).fill(false);
      state.mistimed = 0;
      state.undo = [];
      state.redo = [];
      toast("الجلسة السابقة كانت مكتملة — بدأت من جديد");
    }
    syncHistoryButtons();
    fitCamera();
    renderPalette();
    updateProgress();
    startTimer(elapsedOffset || 0);
    resizeBoard();
    state.needsDraw = true;
    saveSession();
  }

  function leaveWorkspace() {
    clearInterval(state.timerId);
    els.workspace.hidden = true;
    els.setup.hidden = false;
    els.resumeBtn.hidden = !hasSaved();
    if (state.sourceImage) analyze();
  }

  function setTool(tool) {
    state.tool = tool;
    ["brush", "fill", "pan"].forEach((t) => {
      const btn = $("tool-" + t);
      if (btn) btn.classList.toggle("active", t === tool);
    });
    els.board.style.cursor = tool === "pan" || state.spaceHeld ? "grab" : "crosshair";
  }

  function syncToggles() {
    $("focus-btn").setAttribute("aria-pressed", String(state.focusMode));
    $("hint-btn").setAttribute("aria-pressed", String(state.showHint));
    $("grid-btn").setAttribute("aria-pressed", String(state.showGrid));
    $("ref-btn").setAttribute("aria-pressed", String(state.showRef));
    els.refImage.hidden = !state.showRef;
    els.soundBtn.setAttribute("aria-pressed", String(state.soundOn));
  }

  function exportPNG() {
    const gw = state.gridW;
    const gh = state.gridH;
    const scale = Math.max(8, Math.min(20, (1280 / Math.max(gw, gh)) | 0));
    const c = document.createElement("canvas");
    c.width = gw * scale;
    c.height = gh * scale;
    const cctx = c.getContext("2d");
    const finished = countDone() === state.targets.length;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (finished || state.painted[i]) {
          cctx.fillStyle = state.palette[state.targets[i]].hex;
        } else {
          cctx.fillStyle = (x + y) % 2 ? "#e7e0d2" : "#f1ece3";
        }
        cctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = (state.sourceName || "pixel-atelier") + ".png";
    a.click();
    toast("تم التصدير");
  }

  // ——— Events ———
  els.fileInput.addEventListener("change", () => {
    const f = els.fileInput.files && els.fileInput.files[0];
    loadFile(f);
  });

  ["dragenter", "dragover"].forEach((ev) => {
    els.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    els.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      els.dropzone.classList.remove("dragover");
    });
  });
  els.dropzone.addEventListener("drop", (e) => {
    loadFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  const syncLabels = () => {
    els.colorLabel.textContent = els.colorCount.value;
    if (state.sourceImage) {
      const { gw, gh } = computeGridDims(state.sourceImage, Number(els.gridSize.value));
      els.gridLabel.textContent = gw + "×" + gh;
    } else {
      els.gridLabel.textContent = els.gridSize.value;
    }
    const qNames = { draft: "سريعة", balanced: "متوازنة", max: "أقصى دقة" };
    if (els.qualityLabel) els.qualityLabel.textContent = qNames[els.qualityMode.value] || "";
    document.querySelectorAll("#difficulty-presets .chip").forEach((chip) => {
      chip.classList.toggle(
        "active",
        chip.dataset.grid === els.gridSize.value &&
          chip.dataset.colors === els.colorCount.value
      );
    });
    if (state.sourceImage) analyze();
  };
  els.gridSize.addEventListener("input", syncLabels);
  els.colorCount.addEventListener("input", syncLabels);
  els.dither.addEventListener("change", () => state.sourceImage && analyze());
  if (els.edgeToggle) els.edgeToggle.addEventListener("change", () => state.sourceImage && analyze());
  if (els.qualityMode) els.qualityMode.addEventListener("change", syncLabels);
  if (els.fitMode) els.fitMode.addEventListener("change", () => state.sourceImage && analyze());

  document.querySelectorAll("#difficulty-presets .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      els.gridSize.value = chip.dataset.grid;
      els.colorCount.value = chip.dataset.colors;
      if (chip.dataset.quality && els.qualityMode) {
        els.qualityMode.value = chip.dataset.quality;
      }
      syncLabels();
    });
  });

  els.startBtn.addEventListener("click", () => enterWorkspace(true));
  els.resumeBtn.addEventListener("click", resumeSession);
  $("back-btn").addEventListener("click", leaveWorkspace);
  $("done-again").addEventListener("click", leaveWorkspace);
  $("export-btn").addEventListener("click", exportPNG);
  $("done-export").addEventListener("click", exportPNG);

  $("tool-brush").addEventListener("click", () => setTool("brush"));
  $("tool-fill").addEventListener("click", () => setTool("fill"));
  $("tool-pan").addEventListener("click", () => setTool("pan"));
  $("undo-btn").addEventListener("click", undo);
  $("redo-btn").addEventListener("click", redo);

  $("focus-btn").addEventListener("click", () => {
    state.focusMode = !state.focusMode;
    syncToggles();
    state.needsDraw = true;
  });
  $("hint-btn").addEventListener("click", () => {
    state.showHint = !state.showHint;
    syncToggles();
    state.needsDraw = true;
  });
  $("grid-btn").addEventListener("click", () => {
    state.showGrid = !state.showGrid;
    syncToggles();
    state.needsDraw = true;
  });
  $("ref-btn").addEventListener("click", () => {
    state.showRef = !state.showRef;
    syncToggles();
  });
  els.soundBtn.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    syncToggles();
  });

  $("reset-btn").addEventListener("click", () => {
    if (!confirm("مسح كل التلوين في هذه الجلسة؟")) return;
    state.painted = new Array(state.targets.length).fill(false);
    state.undo = [];
    state.redo = [];
    state.completed = false;
    els.doneBanner.hidden = true;
    syncHistoryButtons();
    updateProgress();
    renderPalette();
    state.needsDraw = true;
    saveSession();
  });

  $("zoom-in").addEventListener("click", () => setZoom(state.cam.zoom * 1.15));
  $("zoom-out").addEventListener("click", () => setZoom(state.cam.zoom / 1.15));
  $("zoom-fit").addEventListener("click", fitCamera);

  if (els.zoomSlider) {
    els.zoomSlider.addEventListener("input", () => {
      setZoom(Number(els.zoomSlider.value) / 100);
    });
  }

  bindHoldPan($("pan-up"), "up");
  bindHoldPan($("pan-down"), "down");
  bindHoldPan($("pan-left"), "left");
  bindHoldPan($("pan-right"), "right");

  // Prevent nav dock clicks from painting the canvas underneath
  const navDock = $("nav-dock");
  if (navDock) {
    navDock.addEventListener("pointerdown", (e) => e.stopPropagation());
    navDock.addEventListener("wheel", (e) => e.stopPropagation());
  }

  els.stage.addEventListener(
    "wheel",
    (e) => {
      if (els.workspace.hidden) return;
      e.preventDefault();
      const rect = els.board.getBoundingClientRect();
      const dpr = els.board.width / rect.width;
      // Zoom toward cursor position relative to view center
      const cx = (e.clientX - rect.left) * dpr - els.board.width / 2;
      const cy = (e.clientY - rect.top) * dpr - els.board.height / 2;
      const intensity = Math.min(0.25, Math.abs(e.deltaY) / 400);
      const factor = e.deltaY > 0 ? 1 - intensity : 1 + intensity;
      setZoom(state.cam.zoom * factor, cx, cy);
    },
    { passive: false }
  );

  els.board.addEventListener("pointerdown", (e) => {
    // Ignore secondary touch while pinching
    if (state.pinch) return;
    els.board.setPointerCapture(e.pointerId);
    state.pointer.lastX = e.clientX;
    state.pointer.lastY = e.clientY;
    const pan = state.tool === "pan" || state.spaceHeld || e.button === 1 || e.button === 2;
    if (pan) {
      state.panning = true;
      els.board.style.cursor = "grabbing";
      return;
    }
    state.painting = true;
    tryPaintAt(cellFromEvent(e));
  });

  els.board.addEventListener("pointermove", (e) => {
    if (state.pinch) return;
    const cell = cellFromEvent(e);
    if (cell !== state.hoverCell) {
      state.hoverCell = cell;
      state.needsDraw = true;
    }
    if (state.panning) {
      const dpr = els.board.width / els.board.getBoundingClientRect().width;
      panBy(
        (e.clientX - state.pointer.lastX) * dpr,
        (e.clientY - state.pointer.lastY) * dpr
      );
      state.pointer.lastX = e.clientX;
      state.pointer.lastY = e.clientY;
      return;
    }
    if (state.painting && state.tool === "brush") {
      tryPaintAt(cell);
    }
  });

  const endPointer = () => {
    state.painting = false;
    state.panning = false;
    els.board.style.cursor =
      state.tool === "pan" || state.spaceHeld ? "grab" : "crosshair";
  };
  els.board.addEventListener("pointerup", endPointer);
  els.board.addEventListener("pointercancel", endPointer);
  els.board.addEventListener("pointerleave", () => {
    state.hoverCell = -1;
    state.needsDraw = true;
  });
  els.board.addEventListener("contextmenu", (e) => e.preventDefault());

  // Pinch-to-zoom + two-finger pan (touch)
  const activePointers = new Map();
  els.stage.addEventListener("pointerdown", (e) => {
    if (els.workspace.hidden) return;
    if (e.target.closest && e.target.closest(".nav-dock")) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      state.painting = false;
      state.panning = false;
      const pts = [...activePointers.values()];
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      state.pinch = {
        dist: Math.hypot(dx, dy) || 1,
        zoom: state.cam.zoom,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        camX: state.cam.x,
        camY: state.cam.y,
      };
    }
  });
  els.stage.addEventListener("pointermove", (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2 && state.pinch) {
      const pts = [...activePointers.values()];
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy) || 1;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const rect = els.board.getBoundingClientRect();
      const dpr = els.board.width / rect.width;
      const anchorX = (midX - rect.left) * dpr - els.board.width / 2;
      const anchorY = (midY - rect.top) * dpr - els.board.height / 2;
      setZoom(state.pinch.zoom * (dist / state.pinch.dist), anchorX, anchorY);
      const panDx = (midX - state.pinch.midX) * dpr;
      const panDy = (midY - state.pinch.midY) * dpr;
      state.cam.x = state.pinch.camX + panDx;
      state.cam.y = state.pinch.camY + panDy;
      clampCamera();
      state.needsDraw = true;
    }
  });
  const endPinch = (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) state.pinch = null;
  };
  els.stage.addEventListener("pointerup", endPinch);
  els.stage.addEventListener("pointercancel", endPinch);

  window.addEventListener("keydown", (e) => {
    if (els.workspace.hidden) return;
    if (e.code === "Space") {
      state.spaceHeld = true;
      els.board.style.cursor = "grab";
      e.preventDefault();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      panStep("up");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      panStep("down");
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      panStep("left");
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      panStep("right");
    }
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setZoom(state.cam.zoom * 1.12);
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setZoom(state.cam.zoom / 1.12);
    }
    if (e.key === "0" && !e.ctrlKey && !e.metaKey) {
      fitCamera();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    }
    if (e.key.toLowerCase() === "b") setTool("brush");
    if (e.key.toLowerCase() === "f") setTool("fill");
    if (e.key.toLowerCase() === "h") {
      state.showHint = !state.showHint;
      syncToggles();
      state.needsDraw = true;
    }
    if (e.key >= "1" && e.key <= "9") {
      const idx = Number(e.key) - 1;
      if (idx < state.palette.length) {
        state.selectedColor = idx;
        renderPalette();
        state.needsDraw = true;
      }
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      state.spaceHeld = false;
      els.board.style.cursor = state.tool === "pan" ? "grab" : "crosshair";
    }
  });

  window.addEventListener("resize", () => {
    if (!els.workspace.hidden) {
      resizeBoard();
      state.needsDraw = true;
    }
  });

  // autosave periodically
  setInterval(() => {
    if (!els.workspace.hidden) saveSession();
  }, 8000);

  // init
  buildGallery();
  els.resumeBtn.hidden = !hasSaved();
  syncLabels();
  loop();
})();
